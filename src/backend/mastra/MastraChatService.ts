import { Mastra } from '@mastra/core/mastra'
import { Agent } from '@mastra/core/agent'
import { InMemoryStore } from '@mastra/core/storage'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { UIMessage } from 'ai'
import { randomUUID } from 'crypto'
import type { AIMessage, AIProvider, AppEvent } from '@common/types'
import { EventType } from '@common/types'
import { getAISettingsV2 as loadAISettingsV2 } from '../settings/ai-settings'
import { mastraToolService, type MastraToolRecord } from './MastraToolService'
import { mcpManager } from '../mcp'
import logger from '../logger'

type SessionRecord = {
  sessionId: string
  threadId: string
  resourceId: string
  history: AIMessage[]
}

type MessagePart = {
  kind: 'text' | 'tool_invocation' | 'tool_result'
  content?: string
  toolCallId?: string
  toolName?: string
  input?: unknown
  output?: unknown
}

type StreamRecord = {
  streamId: string
  sessionId: string
  abortController: AbortController
  publishEvent: (channel: string, event: AppEvent) => void
  suspended: boolean
  // Deferred onFinish callback for tool approval flow
  onFinish?: (parts: MessagePart[]) => Promise<void>
  // Accumulated parts for deferred message saving
  parts?: MessagePart[]
}

export type MastraStatus =
  | { ready: true; provider: AIProvider; model: string }
  | { ready: false; reason: string }

type ProviderSelection = {
  provider: AIProvider
  model: string
  apiKey: string
  baseURL?: string
}

function toUIMessages(messages: AIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: randomUUID(),
    role: message.role,
    content: [{ type: 'text', text: message.content }],
    parts: [{ type: 'text', text: message.content }]
  }))
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message === 'AbortError')
}

export class MastraChatService {
  // Note: mastraInstance is created to support Mastra's storage/workflow features for tool approval
  // The agent is registered with Mastra to enable InMemoryStore for suspend/resume workflows
  private mastraInstance: Mastra | null = null
  private agent: Agent | null = null
  private selection: ProviderSelection | null = null
  private sessions = new Map<string, SessionRecord>()
  private streams = new Map<string, StreamRecord>()
  private readonly defaultResourceId = 'default-resource'

  /** Get the Mastra instance (used for debugging/testing) */
  getMastraInstance(): Mastra | null {
    return this.mastraInstance
  }

  constructor() {
    // Listen for MCP server status changes to re-initialize agent when servers connect
    mcpManager.onStatusChange((status) => {
      if (status.status === 'connected') {
        logger.info('[Mastra] MCP server connected, invalidating agent to reload tools', {
          serverId: status.serverId
        })
        this.invalidateAgent()
      }
    })
  }

  async getStatus(): Promise<MastraStatus> {
    try {
      const selection = await this.ensureAgent()
      return { ready: true, provider: selection.provider, model: selection.model }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mastra initialization failed'
      return { ready: false, reason: message }
    }
  }

  async startSession(sessionId: string, resourceId?: string): Promise<SessionRecord> {
    await this.ensureAgent()

    // CRITICAL: sessionId is now REQUIRED - must come from database
    if (!sessionId) {
      throw new Error('Session ID is required - must be created in database first')
    }

    // Check if session already exists in Mastra
    const existing = this.sessions.get(sessionId)
    if (existing) {
      logger.info('[Mastra] Session already exists, reusing', { sessionId })
      return existing
    }

    const threadId = randomUUID()
    const session: SessionRecord = {
      sessionId, // Use database-provided ID
      threadId,
      resourceId: resourceId || this.defaultResourceId,
      history: []
    }
    this.sessions.set(sessionId, session)
    logger.info('[Mastra] Session started with DB session ID', {
      sessionId,
      threadId,
      resourceId: session.resourceId
    })
    return session
  }

  getSession(sessionId: string): SessionRecord | null {
    return this.sessions.get(sessionId) || null
  }

  async streamText(
    sessionId: string,
    messages: AIMessage[],
    publishEvent: (channel: string, event: AppEvent) => void,
    onFinish?: (
      parts: Array<{
        kind: 'text' | 'tool_invocation' | 'tool_result'
        content?: string
        toolCallId?: string
        toolName?: string
        input?: unknown
        output?: unknown
      }>
    ) => Promise<void>
  ): Promise<string> {
    const selection = await this.ensureAgent()
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error('Mastraセッションが見つかりません。再度セッションを開始してください。')
    }
    const streamId = randomUUID()
    const abortController = new AbortController()

    this.streams.set(streamId, {
      streamId,
      sessionId: session.sessionId,
      abortController,
      publishEvent,
      suspended: false
    })
    session.history = messages

    const uiMessages = toUIMessages(messages)

    logger.info('[Mastra] Streaming start', {
      sessionId: session.sessionId,
      streamId,
      provider: selection.provider,
      model: selection.model
    })

    // Run streaming asynchronously so the handler can return immediately
    this.runStreaming({
      streamId,
      session,
      uiMessages,
      messages,
      abortController,
      publishEvent,
      onFinish
    }).catch((err) => {
      logger.error('[Mastra] Streaming task failed', {
        streamId,
        error: err instanceof Error ? err.message : err
      })
    })

    return streamId
  }

  private async runStreaming(params: {
    streamId: string
    session: SessionRecord
    uiMessages: UIMessage[]
    messages: AIMessage[]
    abortController: AbortController
    publishEvent: (channel: string, event: AppEvent) => void
    onFinish?: (
      parts: Array<{
        kind: 'text' | 'tool_invocation' | 'tool_result'
        content?: string
        toolCallId?: string
        toolName?: string
        input?: unknown
        output?: unknown
      }>
    ) => Promise<void>
  }): Promise<void> {
    const { streamId, session, uiMessages, messages, abortController, publishEvent, onFinish } =
      params

    try {
      const stream = await this.agent!.stream(uiMessages, {
        format: 'aisdk',
        abortSignal: abortController.signal,
        threadId: session.threadId,
        resourceId: session.resourceId,
        requireToolApproval: true,
        runId: streamId // Use streamId as runId for consistency
      })

      let assistantText = ''
      const parts: Array<{
        kind: 'text' | 'tool_invocation' | 'tool_result'
        content?: string
        toolCallId?: string
        toolName?: string
        input?: unknown
        output?: unknown
      }> = []

      let chunkCount = 0
      const reader = stream.fullStream.getReader()

      // Track current text block being built
      let currentTextBlock = ''

      const flushTextBlock = () => {
        if (currentTextBlock) {
          parts.push({ kind: 'text', content: currentTextBlock })
          currentTextBlock = ''
        }
      }

      while (true) {
        const { value: originalValue, done } = await reader.read()
        if (done) {
          break
        }
        if (!originalValue) {
          continue
        }
        const value = originalValue as any

        switch (value.type) {
          case 'text-delta':
            if (value.text) {
              assistantText += value.text
              currentTextBlock += value.text
              chunkCount += 1
              logger.info('[Mastra] Chunk received', {
                streamId,
                chunkIndex: chunkCount,
                chunkLength: value.text.length,
                totalLength: assistantText.length
              })
              publishEvent('mastraChatChunk', {
                type: EventType.Message,
                payload: { sessionId: session.sessionId, streamId, chunk: value.text }
              })
            }
            break
          case 'tool-call':
            flushTextBlock()
            parts.push({
              kind: 'tool_invocation',
              toolCallId: value.toolCallId,
              toolName: value.toolName,
              input: value.input
            })
            publishEvent('mastraToolCall', {
              type: EventType.Message,
              payload: {
                sessionId: session.sessionId,
                streamId,
                toolCallId: value.toolCallId,
                toolName: value.toolName,
                input: value.input
              }
            })
            break
          case 'tool-result':
            flushTextBlock()
            // Mastra/AI SDK may surface either `result` or `output`
            const output = (value as any).result ?? (value as any).output
            parts.push({
              kind: 'tool_result',
              toolCallId: value.toolCallId,
              toolName: value.toolName,
              output
            })
            publishEvent('mastraToolResult', {
              type: EventType.Message,
              payload: {
                sessionId: session.sessionId,
                streamId,
                toolCallId: value.toolCallId,
                toolName: value.toolName,
                output
              }
            })
            break
          case 'tool-call-approval':
            const toolCallApproval = (value as any).payload || (value as any)

            // Mark stream as suspended to prevent deletion in finally block
            const streamRecord = this.streams.get(streamId)
            if (streamRecord) {
              streamRecord.suspended = true
            }

            logger.info('[Mastra] Tool approval required', {
              streamId,
              toolCallId: toolCallApproval.toolCallId,
              toolName: toolCallApproval.toolName
            })

            publishEvent('mastraToolApprovalRequired', {
              type: EventType.Message,
              payload: {
                sessionId: session.sessionId,
                streamId,
                runId: streamId,
                toolCallId: toolCallApproval.toolCallId,
                toolName: toolCallApproval.toolName,
                serverId: 'unknown', // Server ID is not available in standard approval event
                input: toolCallApproval.parameters || {},
                suspendData: toolCallApproval
              }
            })
            break
          case 'finish':
            publishEvent('mastraChatEnd', {
              type: EventType.Message,
              payload: { sessionId: session.sessionId, streamId, text: assistantText }
            })
            break
          case 'error':
            const chunkError = (value as any).error
            const errMessage =
              typeof chunkError === 'string'
                ? chunkError
                : chunkError && typeof chunkError === 'object' && 'message' in chunkError
                  ? (chunkError as Error).message
                  : undefined
            publishEvent('mastraChatError', {
              type: EventType.Message,
              payload: { sessionId: session.sessionId, streamId, error: errMessage }
            })
            break
          default:
            break
        }
      }

      flushTextBlock()

      if (assistantText) {
        session.history = [...messages, { role: 'assistant', content: assistantText }]
      }

      logger.info('[Mastra] Streaming completed', {
        sessionId: session.sessionId,
        streamId,
        textLength: assistantText.length,
        partsCount: parts.length,
        chunks: chunkCount,
        suspended: this.streams.get(streamId)?.suspended
      })

      // Check if stream was suspended for tool approval
      const streamRecordAfterLoop = this.streams.get(streamId)
      if (streamRecordAfterLoop?.suspended) {
        // Defer onFinish until after tool approval/continuation completes
        // Store the callback and parts for later execution
        streamRecordAfterLoop.onFinish = onFinish
        streamRecordAfterLoop.parts = parts
        logger.info('[Mastra] Deferring message save until tool approval completes', {
          streamId,
          partsCount: parts.length
        })
      } else {
        // Normal flow: call onFinish immediately
        if (onFinish) {
          await onFinish(parts)
        }
      }
    } catch (err) {
      if (isAbortError(err)) {
        logger.info('[Mastra] Stream aborted', { streamId })
        publishEvent('mastraChatAborted', {
          type: EventType.Message,
          payload: { sessionId: session.sessionId, streamId }
        })
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error'
        logger.error('[Mastra] Stream failed', { streamId, error: message })
        publishEvent('mastraChatError', {
          type: EventType.Message,
          payload: { sessionId: session.sessionId, streamId, error: message }
        })
      }
    } finally {
      // Don't delete stream if it's suspended - will be deleted after resumeToolExecution completes
      const streamRecord = this.streams.get(streamId)
      if (!streamRecord?.suspended) {
        this.streams.delete(streamId)
      }
    }
  }

  /**
   * Resume a suspended tool execution with approval or denial
   */
  async resumeToolExecution(runId: string, toolCallId: string, approved: boolean): Promise<void> {
    if (!this.agent) {
      throw new Error('Agent not initialized')
    }

    // Get the stream record to access sessionId, publishEvent, and deferred callback
    const streamRecord = this.streams.get(runId)
    if (!streamRecord) {
      logger.error('[Mastra] Cannot resume - stream not found', { runId })
      throw new Error(`Stream not found: ${runId}`)
    }

    const { sessionId, publishEvent, onFinish, parts: originalParts } = streamRecord

    logger.info('[Mastra] Resuming tool execution', {
      runId,
      toolCallId,
      approved,
      sessionId,
      hasDeferredCallback: !!onFinish,
      originalPartsCount: originalParts?.length
    })

    // Track continuation parts (tool_result, additional text)
    const continuationParts: MessagePart[] = []
    let continuationText = ''

    try {
      // Call approve/decline and get the continuation stream
      const continuationStream = approved
        ? await this.agent.approveToolCall({
            runId,
            toolCallId,
            format: 'aisdk'
          })
        : await this.agent.declineToolCall({
            runId,
            toolCallId,
            format: 'aisdk'
          })

      logger.info('[Mastra] Reading continuation stream', { runId, approved })

      // Read chunks from the continuation stream
      const reader = continuationStream.fullStream.getReader()

      while (true) {
        const { value: originalValue, done } = await reader.read()
        if (done) {
          logger.info('[Mastra] Continuation stream completed', { runId })
          break
        }
        if (!originalValue) {
          continue
        }
        const value = originalValue as any

        // Process each chunk type and publish to frontend
        switch (value.type) {
          case 'text-delta':
            if (value.text) {
              continuationText += value.text
              publishEvent('mastraChatChunk', {
                type: EventType.Message,
                payload: { sessionId, streamId: runId, chunk: value.text }
              })
            }
            break
          case 'tool-result':
            // Mastra/AI SDK may surface either `result` or `output`
            const output = (value as any).result ?? (value as any).output
            // Track tool result for deferred message saving
            continuationParts.push({
              kind: 'tool_result',
              toolCallId: value.toolCallId,
              toolName: value.toolName,
              output
            })
            publishEvent('mastraToolResult', {
              type: EventType.Message,
              payload: {
                sessionId,
                streamId: runId,
                toolCallId: value.toolCallId,
                toolName: value.toolName,
                output
              }
            })
            logger.info('[Mastra] Tool result received', {
              runId,
              toolCallId: value.toolCallId,
              toolName: value.toolName
            })
            break
          case 'finish':
            publishEvent('mastraChatEnd', {
              type: EventType.Message,
              payload: { sessionId, streamId: runId, text: '' }
            })
            break
          case 'error':
            const chunkError = (value as any).error
            const errMessage =
              typeof chunkError === 'string'
                ? chunkError
                : chunkError && typeof chunkError === 'object' && 'message' in chunkError
                  ? (chunkError as Error).message
                  : undefined
            publishEvent('mastraChatError', {
              type: EventType.Message,
              payload: { sessionId, streamId: runId, error: errMessage }
            })
            break
          default:
            break
        }
      }

      // After continuation completes, call deferred onFinish with merged parts
      if (onFinish && originalParts) {
        // Add any continuation text as a text part
        if (continuationText) {
          continuationParts.push({ kind: 'text', content: continuationText })
        }

        // Merge original parts with continuation parts
        const mergedParts = [...originalParts, ...continuationParts]

        logger.info('[Mastra] Calling deferred onFinish with merged parts', {
          runId,
          originalPartsCount: originalParts.length,
          continuationPartsCount: continuationParts.length,
          mergedPartsCount: mergedParts.length
        })

        await onFinish(mergedParts)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logger.error('[Mastra] Failed to resume tool execution', {
        runId,
        toolCallId,
        error: message
      })
      publishEvent('mastraChatError', {
        type: EventType.Message,
        payload: { sessionId, streamId: runId, error: message }
      })
      throw err
    } finally {
      // Clean up stream record after continuation completes
      this.streams.delete(runId)
      logger.info('[Mastra] Stream cleaned up after resume', { runId })
    }
  }

  abortStream(streamId: string): boolean {
    const record = this.streams.get(streamId)
    if (!record) {
      return false
    }
    record.abortController.abort()
    this.streams.delete(streamId)
    return true
  }

  /**
   * Invalidate the agent to force re-initialization with fresh tools
   * Call this when MCP servers change or AI settings change
   */
  invalidateAgent(): void {
    this.agent = null
    this.selection = null
    mastraToolService.invalidateCache()
    logger.info('[Mastra] Agent invalidated - will reinitialize on next request')
  }

  /**
   * Reset all in-memory sessions
   * Call this on startup to ensure no stale sessions exist
   */
  resetSessions(): void {
    this.sessions.clear()
    this.streams.clear()
    this.invalidateAgent()
    logger.info('[Mastra] All sessions reset')
  }

  /**
   * Get the current tool count (for status display)
   */
  async getToolCount(): Promise<number> {
    return mastraToolService.getToolCount()
  }

  private async ensureAgent(): Promise<ProviderSelection> {
    if (this.agent && this.selection) {
      return this.selection
    }

    const selection = await this.resolveProvider()
    const modelConfig: MastraModelConfig = {
      id: `${selection.provider}/${selection.model}`,
      apiKey: selection.apiKey,
      ...(selection.baseURL ? { url: selection.baseURL } : {})
    }

    // Get MCP tools converted to Mastra format
    const tools = await this.loadTools()

    this.agent = new Agent({
      name: 'mastra-assistant',
      instructions:
        'You are Releio assistant running on Mastra. Respond concisely and clearly for desktop users. You have access to tools from connected MCP servers.',
      model: modelConfig,
      tools
    })

    // Initialize Mastra with InMemoryStorage to support tool approval workflows
    this.mastraInstance = new Mastra({
      agents: {
        'mastra-assistant': this.agent
      },
      storage: new InMemoryStore()
    })

    this.selection = selection

    logger.info('[Mastra] Agent and Storage initialized', {
      provider: selection.provider,
      model: selection.model,
      baseURL: selection.baseURL ? 'custom' : 'default',
      toolCount: Object.keys(tools).length
    })

    return selection
  }

  /**
   * Load tools from MastraToolService with permission checking
   * Uses ToolPermissionService to determine which tools require approval
   */
  private async loadTools(): Promise<MastraToolRecord> {
    try {
      // Phase 3: Use permission-aware tool loading
      const tools = await mastraToolService.getAllToolsWithPermissions()
      const toolNames = Object.keys(tools)

      if (toolNames.length > 0) {
        logger.info('[Mastra] Tools loaded with permissions', {
          count: toolNames.length,
          tools: toolNames
        })
      } else {
        logger.info('[Mastra] No tools available (no MCP servers connected)')
      }

      return tools
    } catch (err) {
      logger.error('[Mastra] Failed to load tools', {
        error: err instanceof Error ? err.message : err
      })
      // Return empty tools on error - agent can still function without tools
      return {}
    }
  }

  private async resolveProvider(): Promise<ProviderSelection> {
    const settings = await loadAISettingsV2()
    const active = settings.providerConfigs.find(
      (config) => config.enabled && config.models.length > 0 && config.config.apiKey
    )

    if (!active) {
      throw new Error('有効なプロバイダー設定がありません（APIキーとモデルを確認してください）')
    }

    if (active.type === 'azure') {
      throw new Error('Mastra MVPではAzureプロバイダーを未サポートです')
    }

    const model = active.models[0]?.id
    if (!model) {
      throw new Error('利用可能なモデルが見つかりません')
    }

    return {
      provider: active.type,
      model,
      apiKey: active.config.apiKey,
      baseURL: active.config.baseURL
    }
  }
}

export const mastraChatService = new MastraChatService()
