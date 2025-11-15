import { streamText, stepCountIs } from 'ai'
import logger from '../logger'
import { createModel } from './factory'
import type { AIMessage, AIConfig, AppEvent } from '@common/types'
import { EventType } from '@common/types'
import type { StreamSession } from './stream-session-store'
import { ChatSessionStore } from '../session/ChatSessionStore'
import { db } from '../db'
import type { AddMessageRequest, RecordToolInvocationResultRequest } from '@common/chat-types'

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.message === 'AbortError' || error.name === 'AbortError')
}

export async function streamSessionText(
  config: AIConfig,
  messages: AIMessage[],
  session: StreamSession,
  publishEvent: (channel: string, event: AppEvent) => void,
  cb: () => void,
  tools?: Record<string, any>
): Promise<void> {
  // Initialize ChatSessionStore if we have a chat session ID
  const chatSessionStore = session.chatSessionId ? new ChatSessionStore(db) : null

  // Accumulate message parts for persistence in streaming order
  const persistedParts: AddMessageRequest['parts'] = []
  const toolResults: Array<{ toolCallId: string; toolName: string; output: unknown }> = []

  try {
    const model = await createModel(config)

    // Add abort signal listener for logging
    session.abortSignal.addEventListener('abort', () => {
      logger.info(
        `ABORT SIGNAL RECEIVED - Cancelling AI provider request for ${config.provider} (session: ${session.id})`
      )
    })

    // Log MCP tools availability
    const toolCount = tools ? Object.keys(tools).length : 0
    if (toolCount > 0) {
      logger.info(`[MCP] ${toolCount} tool(s) available for session ${session.id}`)
      Object.entries(tools!).forEach(([name, tool]) => {
        logger.info(`[MCP] Tool: ${name} - ${tool.description || 'No description'}`)
      })
    } else {
      logger.info(`[MCP] No MCP tools available for session ${session.id}`)
    }

    const result = streamText({
      model,
      messages,
      temperature: 0.7,
      abortSignal: session.abortSignal,
      // Enable multi-step tool calling (up to 10 steps for complex scenarios)
      stopWhen: stepCountIs(10),
      // MCP tools are already in AI SDK v5 format (Record<string, Tool>)
      ...(tools && toolCount > 0 ? { tools } : {})
    })

    logger.info(`[AI] Response streaming started with ${config.provider} for session: ${session.id}`)

    // Use fullStream to access tool calls and results
    for await (const chunk of result.fullStream) {
      // Check if session was aborted
      if (session.abortSignal.aborted) {
        logger.info(`Stream aborted during chunk processing for session: ${session.id}`)
        publishEvent('aiChatAborted', {
          type: EventType.Message,
          payload: { sessionId: session.id }
        })
        return
      }

      // Handle different chunk types
      switch (chunk.type) {
        case 'text-delta': {
          if (!chunk.text) {
            break
          }

          const lastPart = persistedParts[persistedParts.length - 1]

          if (lastPart?.kind === 'text') {
            lastPart.content += chunk.text
          } else {
            persistedParts.push({
              kind: 'text',
              content: chunk.text
            })
          }
          // Send text chunks to renderer
          publishEvent('aiChatChunk', {
            type: EventType.Message,
            payload: { sessionId: session.id, chunk: chunk.text }
          })
          break
        }

        case 'tool-call':
          // Accumulate tool call for persistence
          persistedParts.push({
            kind: 'tool_invocation',
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            input: chunk.input
          })
          // Log tool call
          logger.info(`[MCP] Tool called: ${chunk.toolName}`, {
            toolCallId: chunk.toolCallId,
            input: chunk.input
          })
          // Send tool call to renderer
          publishEvent('aiToolCall', {
            type: EventType.Message,
            payload: {
              sessionId: session.id,
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              input: chunk.input
            }
          })
          break

        case 'tool-result':
          // Accumulate tool result for persistence (will be saved after message is persisted)
          toolResults.push({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            output: chunk.output
          })
          // Log tool result
          logger.info(`[MCP] Tool result received: ${chunk.toolName}`, {
            toolCallId: chunk.toolCallId,
            output: typeof chunk.output === 'string' ? chunk.output.substring(0, 200) : chunk.output
          })
          // Send tool result to renderer
          publishEvent('aiToolResult', {
            type: EventType.Message,
            payload: {
              sessionId: session.id,
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              output: chunk.output
            }
          })
          break

        case 'finish':
          // Log final finish
          logger.info(`[AI] Stream finished`, {
            finishReason: chunk.finishReason,
            usage: chunk.totalUsage
          })
          break

        case 'error':
          logger.error(`[AI] Stream error:`, chunk.error)
          break
      }
    }

    // Signal end of stream if not aborted
    if (!session.abortSignal.aborted) {
      publishEvent('aiChatEnd', { type: EventType.Message, payload: { sessionId: session.id } })

      // Save assistant message to database
      if (chatSessionStore && session.chatSessionId) {
        try {
          // Only save if there are parts
          if (persistedParts.length > 0) {
            const messageRequest: AddMessageRequest = {
              sessionId: session.chatSessionId,
              role: 'assistant',
              parts: persistedParts
            }
            const messageId = await chatSessionStore.addMessage(messageRequest)
            logger.info(
              `[DB] Assistant message saved: ${messageId} (${persistedParts.length} parts)`
            )

            // Now that tool invocations are persisted, save their results
            for (const toolResult of toolResults) {
              try {
                const toolResultRequest: RecordToolInvocationResultRequest = {
                  toolCallId: toolResult.toolCallId,
                  status: 'success',
                  output: toolResult.output
                }
                await chatSessionStore.recordToolInvocationResult(toolResultRequest)
                logger.info(`[DB] Tool result saved: ${toolResult.toolName} (${toolResult.toolCallId})`)
              } catch (error) {
                logger.error(`[DB] Failed to save tool result: ${toolResult.toolName}`, error)
              }
            }
          }
        } catch (error) {
          logger.error('[DB] Failed to save assistant message:', error)
        }
      }

      logger.info(
        `✅ AI response streaming completed successfully with ${config.provider} for session: ${session.id}`
      )
    }
  } catch (error) {
    if (isAbortError(error)) {
      logger.info(`AI chat stream was aborted for session: ${session.id}`)
      publishEvent('aiChatAborted', {
        type: EventType.Message,
        payload: { sessionId: session.id }
      })
    } else {
      logger.error('AI chat stream error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      publishEvent('aiChatError', {
        type: EventType.Message,
        payload: { sessionId: session.id, error: errorMessage }
      })
    }
  } finally {
    // Execute caller-provided cleanup
    cb()
  }
}
