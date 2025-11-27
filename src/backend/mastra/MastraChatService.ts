import { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { UIMessage } from 'ai'
import { randomUUID } from 'crypto'
import type { AIMessage, AIProvider, AppEvent } from '@common/types'
import { EventType } from '@common/types'
import { getAISettingsV2 as loadAISettingsV2 } from '../settings/ai-settings'
import logger from '../logger'

type SessionRecord = {
  sessionId: string
  threadId: string
  resourceId: string
  history: AIMessage[]
}

type StreamRecord = {
  streamId: string
  sessionId: string
  abortController: AbortController
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
  private agent: Agent | null = null
  private selection: ProviderSelection | null = null
  private sessions = new Map<string, SessionRecord>()
  private streams = new Map<string, StreamRecord>()
  private readonly defaultResourceId = 'default-resource'

  async getStatus(): Promise<MastraStatus> {
    try {
      const selection = await this.ensureAgent()
      return { ready: true, provider: selection.provider, model: selection.model }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mastra initialization failed'
      return { ready: false, reason: message }
    }
  }

  async startSession(resourceId?: string): Promise<SessionRecord> {
    await this.ensureAgent()
    const sessionId = randomUUID()
    const threadId = randomUUID()
    const session: SessionRecord = {
      sessionId,
      threadId,
      resourceId: resourceId || this.defaultResourceId,
      history: []
    }
    this.sessions.set(sessionId, session)
    logger.info('[Mastra] Session started', { sessionId, threadId, resourceId: session.resourceId })
    return session
  }

  async streamText(
    sessionId: string,
    messages: AIMessage[],
    publishEvent: (channel: string, event: AppEvent) => void
  ): Promise<string> {
    const selection = await this.ensureAgent()
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error('Mastraセッションが見つかりません。再度セッションを開始してください。')
    }
    const streamId = randomUUID()
    const abortController = new AbortController()

    this.streams.set(streamId, { streamId, sessionId: session.sessionId, abortController })
    session.history = messages

    const uiMessages = toUIMessages(messages)

    logger.info('[Mastra] Streaming start', {
      sessionId: session.sessionId,
      streamId,
      provider: selection.provider,
      model: selection.model
    })

    try {
      const stream = await this.agent!.stream(uiMessages, {
        format: 'aisdk',
        abortSignal: abortController.signal,
        threadId: session.threadId,
        resourceId: session.resourceId
      })

      let assistantText = ''
      const reader = stream.fullStream.getReader()

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }
        if (!value) {
          continue
        }

        switch (value.type) {
          case 'text-delta':
            if (value.text) {
              assistantText += value.text
              publishEvent('mastraChatChunk', {
                type: EventType.Message,
                payload: { sessionId: session.sessionId, streamId, chunk: value.text }
              })
            }
            break
          case 'tool-call':
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
            // Mastra/AI SDK may surface either `result` or `output`
            const output = (value as any).result ?? (value as any).output
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

      if (assistantText) {
        session.history = [...messages, { role: 'assistant', content: assistantText }]
      }

      logger.info('[Mastra] Streaming completed', {
        sessionId: session.sessionId,
        streamId,
        textLength: assistantText.length
      })
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
      this.streams.delete(streamId)
    }

    return streamId
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

    this.agent = new Agent({
      name: 'mastra-assistant',
      instructions:
        'You are Releio assistant running on Mastra. Respond concisely and clearly for desktop users.',
      model: modelConfig
    })
    this.selection = selection

    logger.info('[Mastra] Agent initialized', {
      provider: selection.provider,
      model: selection.model,
      baseURL: selection.baseURL ? 'custom' : 'default'
    })

    return selection
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
