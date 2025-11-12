import { logger } from '@renderer/lib/logger'
import { isOk, isError } from '@common/result'
import type { AIMessage, AIModelSelection, AppEvent, ToolCallPayload, ToolResultPayload } from '@common/types'

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }

export async function streamText(
  messages: AIMessage[],
  abortSignal: AbortSignal,
  modelSelection: AIModelSelection | null = null
): Promise<AsyncGenerator<StreamChunk, void, unknown>> {
  const options = modelSelection ? { modelSelection } : undefined
  const result = await window.backend.streamAIText(messages, options)

  if (isOk(result)) {
    const sessionId = result.value
    return receiveStream(sessionId, abortSignal)
  } else {
    logger.error('Failed to start stream:', result.error)
    throw new Error(`Failed to start AI chat stream: ${result.error}`)
  }
}

async function* receiveStream(
  sessionId: string,
  abortSignal: AbortSignal
): AsyncGenerator<StreamChunk, void, unknown> {
  let completed = false
  let error: string | null = null
  let pendingChunks: StreamChunk[] = []

  // Promise-based chunk waiting
  let resolveYieldLoopBlocker: (() => void) | null = null

  // Simplified waiting notification
  const unblockYieldLoop = (): void => {
    if (!resolveYieldLoopBlocker) return
    resolveYieldLoopBlocker()
    resolveYieldLoopBlocker = null
  }

  // Cleaner async waiting mechanism
  const waitForEvent = (): Promise<void> =>
    new Promise<void>((resolve) => {
      resolveYieldLoopBlocker = resolve
      // Immediate resolve if stream is already finished
      if (completed || error || abortSignal.aborted) {
        resolve()
      }
    })

  const handleChunk = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as { sessionId: string; chunk: string }
    if (payload.sessionId !== sessionId) return
    if (payload.chunk) {
      pendingChunks.push({ type: 'text', text: payload.chunk })
    }
    unblockYieldLoop()
  }

  const handleToolCall = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as ToolCallPayload
    if (payload.sessionId !== sessionId) return
    logger.info('[MCP] Tool call received in renderer:', payload.toolName)
    pendingChunks.push({
      type: 'tool-call',
      toolCallId: payload.toolCallId,
      toolName: payload.toolName,
      input: payload.input
    })
    unblockYieldLoop()
  }

  const handleToolResult = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as ToolResultPayload
    if (payload.sessionId !== sessionId) return
    logger.info('[MCP] Tool result received in renderer:', payload.toolName)
    pendingChunks.push({
      type: 'tool-result',
      toolCallId: payload.toolCallId,
      toolName: payload.toolName,
      output: payload.output
    })
    unblockYieldLoop()
  }

  const handleEnd = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as { sessionId: string }
    if (payload.sessionId !== sessionId) return
    completed = true
    unblockYieldLoop()
  }

  const handleError = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as { sessionId: string; error: string }
    if (payload.sessionId !== sessionId) return
    error = payload.error || 'Unknown error'
    logger.error('AI stream error for session:', sessionId, error)
    unblockYieldLoop()
  }

  const handleAborted = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as { sessionId: string }
    if (payload.sessionId !== sessionId) return
    completed = true
    logger.info('AI stream aborted:', sessionId)
    unblockYieldLoop()
  }

  // Handle external abort signal
  const handleAbortSignal = async (): Promise<void> => {
    logger.info('AI stream abort signal received')
    const result = await window.backend.abortAIText(sessionId)
    if (isError(result)) {
      logger.error('Failed to abort chat session:', result.error)
    }
  }

  try {
    // Set up event listeners directly from backend
    window.backend.onEvent('aiChatChunk', handleChunk)
    window.backend.onEvent('aiToolCall', handleToolCall)
    window.backend.onEvent('aiToolResult', handleToolResult)
    window.backend.onEvent('aiChatEnd', handleEnd)
    window.backend.onEvent('aiChatError', handleError)
    window.backend.onEvent('aiChatAborted', handleAborted)
    abortSignal.addEventListener('abort', handleAbortSignal)

    // Stream processing loop
    while (!completed && !error && !abortSignal.aborted) {
      // Yield any pending chunks
      if (pendingChunks.length > 0) {
        yield* pendingChunks
        pendingChunks = []
      }

      // Wait for next chunk, completion, or abort
      if (!completed && !error && !abortSignal.aborted) {
        await waitForEvent()
      }
    }

    // Final yield of any remaining chunks
    if (pendingChunks.length > 0) {
      yield* pendingChunks
    }

    // Throw error if one occurred (for proper async generator error handling)
    if (error) {
      throw new Error(error)
    }
  } catch (streamError) {
    logger.error('Stream generator error for session:', sessionId, streamError)
    throw streamError
  } finally {
    // Clean up event listeners - safe to call even if not set up
    window.backend.offEvent('aiChatChunk')
    window.backend.offEvent('aiToolCall')
    window.backend.offEvent('aiToolResult')
    window.backend.offEvent('aiChatEnd')
    window.backend.offEvent('aiChatError')
    window.backend.offEvent('aiChatAborted')
    abortSignal.removeEventListener('abort', handleAbortSignal)
  }
}
