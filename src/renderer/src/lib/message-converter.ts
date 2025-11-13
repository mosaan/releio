import type { ChatMessageWithParts } from '@common/chat-types'
import type { Message } from '@ai-sdk/ui-utils'

/**
 * Converts database ChatMessageWithParts format to AI SDK UI Message format.
 * This is required for importing message history into the assistant-ui runtime.
 */
export function convertToAISDKMessage(dbMessage: ChatMessageWithParts): Message {
  // Extract text content from text parts
  const textParts = dbMessage.parts.filter((p) => p.kind === 'text')
  const content = textParts.map((p) => p.content).join('')

  // Build UI parts array
  const parts: Message['parts'] = []

  for (const part of dbMessage.parts) {
    switch (part.kind) {
      case 'text':
        parts.push({
          type: 'text',
          text: part.content
        })
        break

      case 'tool_invocation':
        parts.push({
          type: 'tool-invocation',
          toolInvocation: {
            state: part.status === 'success' ? 'result' : 'call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.input
          } as any // Type assertion needed due to complex ToolInvocation union
        })
        break

      case 'tool_result':
        // Tool results are embedded in tool_invocation parts in AI SDK UI
        // We handle this by updating the corresponding tool invocation part
        // Find the matching tool invocation part
        const matchingInvocation = parts.find(
          (p): p is Extract<typeof p, { type: 'tool-invocation' }> =>
            p.type === 'tool-invocation' && (p.toolInvocation as any).toolCallId === part.relatedToolCallId
        )

        if (matchingInvocation) {
          // Update the tool invocation to include result
          (matchingInvocation.toolInvocation as any).result = part.output;
          (matchingInvocation.toolInvocation as any).state = 'result'
        }
        break

      // Skip other part types (attachment, metadata) for now
      // They can be added later if needed
    }
  }

  const message: Message = {
    id: dbMessage.id,
    role: dbMessage.role === 'tool' ? 'assistant' : dbMessage.role, // AI SDK doesn't have 'tool' role
    content,
    createdAt: new Date(dbMessage.createdAt),
    parts
  }

  return message
}

/**
 * Converts an array of database messages to AI SDK UI Message format.
 * Messages are sorted by sequence to ensure correct conversation order.
 */
export function convertMessagesToAISDKFormat(dbMessages: ChatMessageWithParts[]): Message[] {
  // Sort messages by sequence to ensure correct order
  const sortedMessages = [...dbMessages].sort((a, b) => a.sequence - b.sequence)

  return sortedMessages.map(convertToAISDKMessage)
}
