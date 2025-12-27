import type {
  AIMessage,
  MastraSessionInfo,
  MastraStatus,
  AppEvent,
  ToolCallPayload,
  ToolResultPayload,
  ToolApprovalRequestPayload
} from '@common/types'
import { isError, isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'

export type MastraStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'tool-approval-required'; request: ToolApprovalRequestPayload }

export async function getMastraStatus(): Promise<MastraStatus> {
  const result = await window.backend.getMastraStatus()
  if (isOk(result)) {
    return result.value
  }
  logger.error('Failed to get Mastra status', result.error)
  return { ready: false, reason: result.error ? String(result.error) : 'Unknown error' }
}

export async function startMastraSession(resourceId?: string): Promise<MastraSessionInfo> {
  const result = await window.backend.startMastraSession(resourceId)
  if (isOk(result)) {
    return result.value
  }
  const message = result.error ? String(result.error) : 'Failed to start Mastra session'
  logger.error(message)
  throw new Error(message)
}

export async function streamMastraText(
  mastraSessionId: string,
  messages: AIMessage[],
  abortSignal: AbortSignal,
  chatSessionId?: string
): Promise<AsyncGenerator<MastraStreamChunk, void, unknown>> {
  const result = await window.backend.streamMastraText(mastraSessionId, messages, chatSessionId)

  if (isOk(result)) {
    const streamId = result.value
    return receiveStream(streamId, mastraSessionId, abortSignal)
  } else {
    logger.error('Failed to start Mastra stream:', result.error)
    throw new Error(`Failed to start Mastra chat stream: ${result.error}`)
  }
}

async function* receiveStream(
  streamId: string,
  sessionId: string,
  abortSignal: AbortSignal
): AsyncGenerator<MastraStreamChunk, void, unknown> {
  let completed = false
  let error: string | null = null
  let pendingChunks: MastraStreamChunk[] = []

  let resolveYieldLoopBlocker: (() => void) | null = null

  const unblockYieldLoop = (): void => {
    if (!resolveYieldLoopBlocker) return
    resolveYieldLoopBlocker()
    resolveYieldLoopBlocker = null
  }

  const waitForEvent = (): Promise<void> =>
    new Promise<void>((resolve) => {
      resolveYieldLoopBlocker = resolve
      if (completed || error || abortSignal.aborted) {
        resolve()
      }
    })

  const handleChunk = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as { sessionId: string; streamId: string; chunk: string }
    if (payload.sessionId !== sessionId || payload.streamId !== streamId) return
    if (payload.chunk) {
      logger.info('[Mastra][Renderer] chunk received', { streamId, len: payload.chunk.length })
      pendingChunks.push({ type: 'text', text: payload.chunk })
    }
    unblockYieldLoop()
  }

  const handleToolCall = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as ToolCallPayload & { streamId: string }
    if (payload.sessionId !== sessionId || payload.streamId !== streamId) return
    pendingChunks.push({
      type: 'tool-call',
      toolCallId: payload.toolCallId,
      toolName: payload.toolName,
      input: payload.input
    })
    unblockYieldLoop()
  }

  const handleToolResult = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as ToolResultPayload & { streamId: string }
    if (payload.sessionId !== sessionId || payload.streamId !== streamId) return
    pendingChunks.push({
      type: 'tool-result',
      toolCallId: payload.toolCallId,
      toolName: payload.toolName,
      output: payload.output
    })
    unblockYieldLoop()
  }

  const handleToolApprovalRequired = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as ToolApprovalRequestPayload
    if (payload.sessionId !== sessionId || payload.streamId !== streamId) return
    logger.info('[Mastra][Renderer] tool approval required', {
      streamId,
      toolName: payload.toolName,
      toolCallId: payload.toolCallId
    })
    pendingChunks.push({
      type: 'tool-approval-required',
      request: payload
    })
    unblockYieldLoop()
  }

  const handleEnd = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as { sessionId: string; streamId: string; text?: string }
    if (payload.sessionId !== sessionId || payload.streamId !== streamId) return
    if (payload.text) {
      logger.info('[Mastra][Renderer] end received with text', {
        streamId,
        len: payload.text.length
      })
      pendingChunks.push({ type: 'text', text: payload.text })
    } else {
      logger.info('[Mastra][Renderer] end received without text', { streamId })
    }
    completed = true
    unblockYieldLoop()
  }

  const handleError = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as { sessionId: string; streamId: string; error: string }
    if (payload.sessionId !== sessionId || payload.streamId !== streamId) return
    error = payload.error || 'Unknown error'
    logger.error('Mastra stream error', { streamId, error })
    unblockYieldLoop()
  }

  const handleAborted = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as { sessionId: string; streamId: string }
    if (payload.sessionId !== sessionId || payload.streamId !== streamId) return
    completed = true
    logger.info('Mastra stream aborted', { streamId })
    unblockYieldLoop()
  }

  const handleAbortSignal = async (): Promise<void> => {
    logger.info('Mastra stream abort signal received')
    const result = await window.backend.abortMastraStream(streamId)
    if (isError(result)) {
      logger.error('Failed to abort Mastra stream:', result.error)
    }
  }

  try {
    // Keep replay enabled so we don't miss early chunks before listeners attach; streamIdでフィルタする
    window.backend.onEvent('mastraChatChunk', handleChunk)
    window.backend.onEvent('mastraToolCall', handleToolCall)
    window.backend.onEvent('mastraToolResult', handleToolResult)
    window.backend.onEvent('mastraToolApprovalRequired', handleToolApprovalRequired)
    window.backend.onEvent('mastraChatEnd', handleEnd)
    window.backend.onEvent('mastraChatError', handleError)
    window.backend.onEvent('mastraChatAborted', handleAborted)
    abortSignal.addEventListener('abort', handleAbortSignal)

    while (!completed && !error && !abortSignal.aborted) {
      if (pendingChunks.length > 0) {
        yield* pendingChunks
        pendingChunks = []
      }

      if (!completed && !error && !abortSignal.aborted) {
        await waitForEvent()
      }
    }

    if (pendingChunks.length > 0) {
      yield* pendingChunks
    }

    if (error) {
      throw new Error(error)
    }
  } catch (streamError) {
    logger.error('Mastra stream generator error', streamError)
    throw streamError
  } finally {
    window.backend.offEvent('mastraChatChunk')
    window.backend.offEvent('mastraToolCall')
    window.backend.offEvent('mastraToolResult')
    window.backend.offEvent('mastraToolApprovalRequired')
    window.backend.offEvent('mastraChatEnd')
    window.backend.offEvent('mastraChatError')
    window.backend.offEvent('mastraChatAborted')
    abortSignal.removeEventListener('abort', handleAbortSignal)
  }
}
