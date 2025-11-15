import { AssistantRuntimeProvider, useLocalRuntime, ExportedMessageRepository } from '@assistant-ui/react'
import type { ChatModelAdapter, ThreadMessage } from '@assistant-ui/react'
import { ReactNode, useEffect, useCallback, useMemo, useRef } from 'react'
import { logger } from '@renderer/lib/logger'
import { streamText } from '@renderer/lib/ai'
import type { AIModelSelection } from '@common/types'
import type { AddMessageRequest, ChatMessageWithParts } from '@common/chat-types'
import { isOk } from '@common/result'
import { convertMessagesToThreadFormat } from '@renderer/lib/message-converter'

interface AIRuntimeProviderProps {
  children: ReactNode
  modelSelection: AIModelSelection | null
  chatSessionId?: string | null
  initialMessages?: ChatMessageWithParts[]
  onMessageCompleted?: () => void | Promise<void>
}

export function AIRuntimeProvider({ children, modelSelection, chatSessionId, initialMessages, onMessageCompleted }: AIRuntimeProviderProps): React.JSX.Element {
  // Keep reference to latest onMessageCompleted callback
  const onMessageCompletedRef = useRef(onMessageCompleted)
  useEffect(() => {
    onMessageCompletedRef.current = onMessageCompleted
  }, [onMessageCompleted])

  // Create adapter with modelSelection and chatSessionId closure
  const createAIModelAdapter = useCallback((
    currentSelection: AIModelSelection | null,
    sessionId: string | null | undefined
  ): ChatModelAdapter => ({
    async *run({ messages, abortSignal }) {
      // Convert Assistant-ui messages to AIMessage format
      const formattedMessages = messages.map((message: ThreadMessage) => ({
        role: message.role as 'user' | 'assistant' | 'system',
        content: message.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('')
      }))

      // Save user message to database before streaming (last message is the new user message)
      if (sessionId && formattedMessages.length > 0) {
        const lastMessage = formattedMessages[formattedMessages.length - 1]
        if (lastMessage.role === 'user' && lastMessage.content) {
          try {
            const messageRequest: AddMessageRequest = {
              sessionId,
              role: 'user',
              parts: [{ kind: 'text', content: lastMessage.content }]
            }
            const result = await window.backend.addChatMessage(messageRequest)
            if (isOk(result)) {
              logger.info(`[DB] User message saved: ${result.value}`)
            } else {
              logger.error('[DB] Failed to save user message:', result.error)
            }
          } catch (error) {
            logger.error('[DB] Error saving user message:', error)
          }
        }
      }

      const selectionInfo = currentSelection
        ? `${currentSelection.providerConfigId}:${currentSelection.modelId}`
        : 'default'
      logger.info(`Starting AI stream with ${formattedMessages.length} messages, selection: ${selectionInfo}`)
      const stream = await streamText(formattedMessages, abortSignal, currentSelection, sessionId)

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
          logger.info('[MCP] Yielding tool-call:', chunk.toolName)
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
          logger.info('[MCP] Yielding tool-result:', chunk.toolName)
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
        }
      }

      logger.info('AI stream completed')

      // Notify that message exchange is complete (both user and assistant messages saved)
      if (onMessageCompletedRef.current) {
        await onMessageCompletedRef.current()
      }
    }
  }), [onMessageCompletedRef])

  const adapter = useMemo(
    () => createAIModelAdapter(modelSelection, chatSessionId),
    [createAIModelAdapter, modelSelection, chatSessionId]
  )

  const runtime = useLocalRuntime(adapter)

  // Import initial messages when session changes
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      logger.info(`[History] Loading ${initialMessages.length} messages into runtime`)

      try {
        // Convert database messages directly to ThreadMessage format
        const threadMessages = convertMessagesToThreadFormat(initialMessages)

        // Import messages into runtime
        runtime.threads.main.import(
          ExportedMessageRepository.fromArray(threadMessages)
        )

        logger.info('[History] Messages loaded successfully')
      } catch (error) {
        logger.error('[History] Failed to load messages:', error)
      }
    } else {
      // Clear messages when switching to a session with no history
      logger.info('[History] No initial messages, clearing runtime')
      runtime.threads.main.import(
        ExportedMessageRepository.fromArray([])
      )
    }
  }, [chatSessionId, initialMessages, runtime])

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
