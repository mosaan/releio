import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelAdapter, ThreadMessage } from '@assistant-ui/react'
import { ReactNode } from 'react'
import { logger } from '@renderer/lib/logger'
import { streamText } from '@renderer/lib/ai'
import type { AIModelSelection } from '@common/types'

interface AIRuntimeProviderProps {
  children: ReactNode
  modelSelection: AIModelSelection | null
}

export function AIRuntimeProvider({ children, modelSelection }: AIRuntimeProviderProps): React.JSX.Element {
  // Create adapter with modelSelection closure
  const createAIModelAdapter = (currentSelection: AIModelSelection | null): ChatModelAdapter => ({
    async *run({ messages, abortSignal }) {
      // Convert Assistant-ui messages to AIMessage format
      const formattedMessages = messages.map((message: ThreadMessage) => ({
        role: message.role as 'user' | 'assistant' | 'system',
        content: message.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('')
      }))

      const selectionInfo = currentSelection
        ? `${currentSelection.providerConfigId}:${currentSelection.modelId}`
        : 'default'
      logger.info(`Starting AI stream with ${formattedMessages.length} messages, selection: ${selectionInfo}`)
      const stream = await streamText(formattedMessages, abortSignal, currentSelection)

      const textChunks: string[] = []
      const contentParts: any[] = []

      // Helper function to build current content array
      const buildContent = () => {
        const parts: any[] = []

        // Add all tool-call parts
        parts.push(...contentParts)

        // Add accumulated text (always include text part, even if empty)
        const textContent = textChunks.join('')
        parts.push({ type: 'text', text: textContent })

        return parts
      }

      for await (const chunk of stream) {
        if (abortSignal?.aborted) return

        if (chunk.type === 'text') {
          textChunks.push(chunk.text)
          yield { content: buildContent() }
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
          yield { content: buildContent() }
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

          yield { content: buildContent() }
        }
      }

      logger.info('AI stream completed')
    }
  })

  const runtime = useLocalRuntime(createAIModelAdapter(modelSelection))

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
