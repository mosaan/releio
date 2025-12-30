import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ExportedMessageRepository
} from '@assistant-ui/react'
import type { ChatModelAdapter, ThreadMessage } from '@assistant-ui/react'
import { ReactNode, useEffect, useCallback, useMemo, useRef } from 'react'
import { logger } from '@renderer/lib/logger'
import { streamMastraText } from '@renderer/lib/mastra-client'
import type { AIModelSelection, ToolApprovalRequestPayload } from '@common/types'
import type {
  AddMessageRequest,
  ChatMessageWithParts,
  ChatSessionWithMessages
} from '@common/chat-types'
import { isOk } from '@common/result'
import {
  convertMessagesToThreadFormat,
  insertCompressionMarkers
} from '@renderer/lib/message-converter'

interface AIRuntimeProviderProps {
  children: ReactNode
  modelSelection: AIModelSelection | null
  chatSessionId?: string | null
  mastraSessionId: string | null
  initialMessages?: ChatMessageWithParts[]
  currentSession?: ChatSessionWithMessages | null
  onMessageCompleted?: () => void | Promise<void>
  onToolApprovalRequired?: (request: ToolApprovalRequestPayload) => void
}

export function AIRuntimeProvider({
  children,
  modelSelection,
  chatSessionId,
  mastraSessionId,
  initialMessages,
  currentSession,
  onMessageCompleted,
  onToolApprovalRequired
}: AIRuntimeProviderProps): React.JSX.Element {
  // Keep reference to latest callbacks
  const onMessageCompletedRef = useRef(onMessageCompleted)
  const onToolApprovalRequiredRef = useRef(onToolApprovalRequired)
  useEffect(() => {
    onMessageCompletedRef.current = onMessageCompleted
    onToolApprovalRequiredRef.current = onToolApprovalRequired
  }, [onMessageCompleted, onToolApprovalRequired])

  // Create adapter with modelSelection, chatSessionId, and mastraSessionId closure
  const createAIModelAdapter = useCallback(
    (
      currentSelection: AIModelSelection | null,
      sessionId: string | null | undefined,
      mastraSession: string | null
    ): ChatModelAdapter => ({
      async *run({ messages, abortSignal }) {
        logger.info('[AIAdapter] run() called', {
          messageCount: messages.length,
          sessionId,
          mastraSessionId: mastraSession,
          lastMessageRole: messages[messages.length - 1]?.role
        })

        // Require Mastra session for streaming
        if (!mastraSession) {
          logger.error('[AIAdapter] No Mastra session available')
          throw new Error('Mastra session not initialized. Please try refreshing the page.')
        }

        // CRITICAL: Validate session IDs match
        if (sessionId && sessionId !== mastraSession) {
          const errorMsg = `Session ID mismatch! DB: ${sessionId}, Mastra: ${mastraSession}`
          logger.error('[AIAdapter]', errorMsg)
          throw new Error(errorMsg)
        }

        // Filter out compression markers (they're for display only, not for AI)
        const messagesToSend = messages.filter((message: ThreadMessage) => {
          // Exclude compression markers (system messages with isCompressionMarker metadata)
          if (message.role === 'system' && message.metadata?.custom?.isCompressionMarker) {
            return false
          }
          return true
        })

        // Convert Assistant-ui messages to AIMessage format
        const formattedMessages = messagesToSend.map((message: ThreadMessage) => ({
          role: message.role as 'user' | 'assistant' | 'system',
          content: message.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('')
        }))

        // Check and perform automatic compression if needed (before saving user message)
        if (sessionId && currentSelection) {
          try {
            // Get provider configuration
            const configResult = await window.backend.getProviderConfiguration(
              currentSelection.providerConfigId
            )
            if (isOk(configResult) && configResult.value) {
              const providerConfig = configResult.value
              const provider = providerConfig.type
              const model = currentSelection.modelId
              const apiKey = providerConfig.config.apiKey || ''

              // Get compression settings to check if auto-compression is enabled
              const settingsResult = await window.backend.getCompressionSettings(sessionId)
              if (isOk(settingsResult) && settingsResult.value.autoCompress) {
                // Check if compression is needed
                const needsCompressionResult = await window.backend.checkCompressionNeeded(
                  sessionId,
                  provider,
                  model
                )

                if (isOk(needsCompressionResult) && needsCompressionResult.value) {
                  logger.info('[Compression] Auto-compression triggered', { sessionId })

                  // Perform compression
                  const compressionResult = await window.backend.compressConversation(
                    sessionId,
                    provider,
                    model,
                    apiKey,
                    false // Don't force, respect threshold
                  )

                  if (isOk(compressionResult) && compressionResult.value.compressed) {
                    logger.info('[Compression] Auto-compression completed successfully', {
                      sessionId,
                      result: compressionResult.value
                    })
                    // Note: Session will be reloaded after message completion
                  } else if (isOk(compressionResult)) {
                    logger.info('[Compression] Auto-compression skipped', {
                      sessionId,
                      reason: compressionResult.value.reason
                    })
                  } else {
                    logger.error('[Compression] Auto-compression failed', {
                      sessionId,
                      error: compressionResult.error
                    })
                  }
                }
              }
            }
          } catch (error) {
            // Don't fail the message send if compression fails
            logger.error('[Compression] Error during auto-compression check:', error)
          }
        }

        // Save user message to database before streaming (last message is the new user message)
        if (sessionId && formattedMessages.length > 0) {
          const lastMessage = formattedMessages[formattedMessages.length - 1]
          logger.info('[DB] Checking if user message should be saved', {
            sessionId,
            lastMessageRole: lastMessage.role,
            hasContent: !!lastMessage.content,
            contentLength: lastMessage.content?.length
          })
          if (lastMessage.role === 'user' && lastMessage.content) {
            try {
              const messageRequest: AddMessageRequest = {
                sessionId,
                role: 'user',
                parts: [{ kind: 'text', content: lastMessage.content }]
              }
              logger.info('[DB] Saving user message to database', {
                sessionId,
                contentPreview: lastMessage.content.substring(0, 50)
              })
              const result = await window.backend.addChatMessage(messageRequest)
              if (isOk(result)) {
                logger.info(`[DB] User message saved successfully: ${result.value}`)
              } else {
                logger.error('[DB] Failed to save user message:', result.error)
              }
            } catch (error) {
              logger.error('[DB] Error saving user message:', error)
            }
          } else {
            logger.warn('[DB] User message not saved - conditions not met', {
              isUser: lastMessage.role === 'user',
              hasContent: !!lastMessage.content
            })
          }
        } else {
          logger.warn('[DB] User message not saved - no session or messages', {
            hasSessionId: !!sessionId,
            messageCount: formattedMessages.length
          })
        }

        const selectionInfo = currentSelection
          ? `${currentSelection.providerConfigId}:${currentSelection.modelId}`
          : 'default'
        logger.info(
          `Starting Mastra stream with ${formattedMessages.length} messages, selection: ${selectionInfo}, mastraSession: ${mastraSession}`
        )

        // Use Mastra streaming instead of v1
        const stream = await streamMastraText(mastraSession, formattedMessages, abortSignal)

        const contentParts: any[] = []

        for await (const chunk of stream) {
          if (abortSignal?.aborted) return

          if (chunk.type === 'text') {
            const lastPart = contentParts[contentParts.length - 1]

            if (lastPart?.type === 'text') {
              contentParts[contentParts.length - 1] = {
                ...lastPart,
                text: `${lastPart.text}${chunk.text}`
              }
            } else {
              contentParts.push({ type: 'text', text: chunk.text })
            }
            yield { content: [...contentParts] }
          } else if (chunk.type === 'tool-call') {
            logger.info('[Mastra] Yielding tool-call:', chunk.toolName)
            // Add tool-call part
            contentParts.push({
              type: 'tool-call',
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: chunk.input,
              argsText: JSON.stringify(chunk.input, null, 2)
            })
            yield { content: [...contentParts] }
          } else if (chunk.type === 'tool-result') {
            logger.info('[Mastra] Yielding tool-result:', chunk.toolName)
            // Find and update corresponding tool-call with result
            const toolCallIndex = contentParts.findIndex(
              (p) => p.type === 'tool-call' && p.toolCallId === chunk.toolCallId
            )

            if (toolCallIndex >= 0) {
              contentParts[toolCallIndex] = {
                ...contentParts[toolCallIndex],
                result: chunk.output
              }
            }

            yield { content: [...contentParts] }
          } else if (chunk.type === 'tool-approval-required') {
            // Notify about tool approval requirement (HITL)
            logger.info('[Mastra] Tool approval required:', chunk.request.toolName)
            if (onToolApprovalRequiredRef.current) {
              onToolApprovalRequiredRef.current(chunk.request)
            }
            // Don't yield - wait for approval/decline via backend events
          }
        }

        logger.info('AI stream completed')

        // Notify that message exchange is complete (both user and assistant messages saved)
        if (onMessageCompletedRef.current) {
          await onMessageCompletedRef.current()
        }
      }
    }),
    [onMessageCompletedRef]
  )

  const adapter = useMemo(
    () => createAIModelAdapter(modelSelection, chatSessionId, mastraSessionId),
    [createAIModelAdapter, modelSelection, chatSessionId, mastraSessionId]
  )

  const runtime = useLocalRuntime(adapter)

  // Import initial messages when session changes
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      logger.info(`[History] Loading ${initialMessages.length} messages into runtime`)

      try {
        // Convert database messages directly to ThreadMessage format
        let threadMessages = convertMessagesToThreadFormat(initialMessages)

        // Insert compression markers if we have summaries
        if (
          currentSession?.compressionSummaries &&
          currentSession.compressionSummaries.length > 0
        ) {
          logger.info(
            `[History] Found ${currentSession.compressionSummaries.length} compression summaries`
          )
          threadMessages = insertCompressionMarkers(
            threadMessages,
            currentSession.compressionSummaries
          )
          logger.info(`[History] Inserted compression markers`)
        }

        // Import messages into runtime
        runtime.threads.main.import(ExportedMessageRepository.fromArray(threadMessages))

        logger.info('[History] Messages loaded successfully')
      } catch (error) {
        logger.error('[History] Failed to load messages:', error)
      }
    } else {
      // Clear messages when switching to a session with no history
      logger.info('[History] No initial messages, clearing runtime')
      runtime.threads.main.import(ExportedMessageRepository.fromArray([]))
    }
  }, [chatSessionId, initialMessages, currentSession?.compressionSummaries, runtime])

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
