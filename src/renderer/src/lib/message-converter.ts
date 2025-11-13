import type { ChatMessageWithParts } from '@common/chat-types'
import type { ThreadMessage, ThreadUserMessage, ThreadAssistantMessage } from '@assistant-ui/react'

/**
 * Converts database ChatMessageWithParts directly to assistant-ui ThreadMessage format.
 * This bypasses the need for AISDKMessageConverter and avoids dependency issues.
 */
export function convertToThreadMessage(dbMessage: ChatMessageWithParts): ThreadMessage {
  const createdAt = new Date(dbMessage.createdAt)

  if (dbMessage.role === 'user') {
    const content: Array<ThreadUserMessage['content'][number]> = []

    for (const part of dbMessage.parts) {
      if (part.kind === 'text') {
        content.push({
          type: 'text',
          text: part.content
        })
      }
      // Handle other user message parts (image, file, audio) if needed in the future
    }

    return {
      id: dbMessage.id,
      role: 'user',
      content,
      createdAt,
      attachments: [],
      metadata: {
        custom: {}
      }
    } as ThreadUserMessage
  }

  if (dbMessage.role === 'assistant' || dbMessage.role === 'tool') {
    const content: Array<ThreadAssistantMessage['content'][number]> = []

    for (const part of dbMessage.parts) {
      switch (part.kind) {
        case 'text':
          content.push({
            type: 'text',
            text: part.content
          })
          break

        case 'tool_invocation': {
          // Find corresponding tool result
          const resultPart = dbMessage.parts.find(
            p => p.kind === 'tool_result' && p.relatedToolCallId === part.toolCallId
          )

          content.push({
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: (part.input || {}) as any,
            argsText: JSON.stringify(part.input || {}, null, 2),
            result: resultPart && 'output' in resultPart ? resultPart.output : undefined,
            isError: resultPart && 'status' in resultPart ? resultPart.status === 'error' : false
          })
          break
        }

        // tool_result parts are handled within tool_invocation
      }
    }

    return {
      id: dbMessage.id,
      role: 'assistant',
      content,
      createdAt,
      status: {
        type: 'complete',
        reason: 'stop'
      },
      metadata: {
        unstable_state: null,
        unstable_annotations: [],
        unstable_data: [],
        steps: [],
        custom: {}
      }
    } as ThreadAssistantMessage
  }

  // Fallback for system messages (though we don't use them currently)
  return {
    id: dbMessage.id,
    role: 'system',
    content: [{
      type: 'text',
      text: dbMessage.parts.find(p => p.kind === 'text')?.content || ''
    }],
    createdAt,
    metadata: {
      custom: {}
    }
  } as ThreadMessage
}

/**
 * Converts an array of database messages to ThreadMessage format.
 * Messages are sorted by sequence to ensure correct conversation order.
 */
export function convertMessagesToThreadFormat(dbMessages: ChatMessageWithParts[]): ThreadMessage[] {
  // Sort messages by sequence to ensure correct order
  const sortedMessages = [...dbMessages].sort((a, b) => a.sequence - b.sequence)

  return sortedMessages.map(convertToThreadMessage)
}
