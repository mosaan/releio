import { drizzle } from 'drizzle-orm/libsql'
import { eq, desc, like, and, sql } from 'drizzle-orm'
import {
  chatSessions,
  chatMessages,
  messageParts,
  toolInvocations,
  settings
} from '../db/schema'
import {
  type ChatSessionRow,
  type ChatSessionWithMessages,
  type ChatMessageWithParts,
  type CreateSessionRequest,
  type AddMessageRequest,
  type RecordToolInvocationResultRequest,
  type ListSessionsOptions,
  type SessionUpdates,
  type MessagePart
} from '@common/chat-types'
import { randomUUID } from 'crypto'

type DrizzleDb = ReturnType<typeof drizzle>

export class ChatSessionStore {
  constructor(private db: DrizzleDb) {}

  // Helper methods for timestamp conversion
  private unixToISO(timestamp: number): string {
    return new Date(timestamp).toISOString()
  }

  // Create a new chat session
  async createSession(request: CreateSessionRequest): Promise<string> {
    const id = randomUUID()
    const now = Date.now()

    await this.db.insert(chatSessions).values({
      id,
      title: request.title || 'New Chat',
      providerConfigId: request.providerConfigId || null,
      modelId: request.modelId || null,
      color: request.color || null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      messageCount: 0,
      dataSchemaVersion: 1,
      archivedAt: null,
      pinnedAt: null,
      summary: null,
      summaryUpdatedAt: null,
      metadata: null
    })

    return id
  }

  // Get a session with all its messages and parts
  async getSession(sessionId: string): Promise<ChatSessionWithMessages | null> {
    // Fetch session
    const sessionResult = await this.db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1)

    if (!sessionResult || sessionResult.length === 0) {
      return null
    }

    const session = sessionResult[0]

    // Fetch all messages for this session, ordered by sequence
    const messagesResult = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.sequence, chatMessages.createdAt)

    // Fetch all parts for this session
    const partsResult = await this.db
      .select()
      .from(messageParts)
      .where(eq(messageParts.sessionId, sessionId))
      .orderBy(messageParts.messageId, messageParts.sequence)

    // Fetch all tool invocations for this session
    const invocationsResult = await this.db
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.sessionId, sessionId))

    // Create a map of tool invocations by part ID
    const invocationsByPartId = new Map(
      invocationsResult.map((inv) => [inv.invocationPartId, inv])
    )

    // Group parts by message ID
    const partsByMessageId = new Map<string, typeof partsResult>()
    for (const part of partsResult) {
      if (!partsByMessageId.has(part.messageId)) {
        partsByMessageId.set(part.messageId, [])
      }
      partsByMessageId.get(part.messageId)!.push(part)
    }

    // Build messages with parts
    const messages: ChatMessageWithParts[] = messagesResult.map((msg) => {
      const msgParts = partsByMessageId.get(msg.id) || []

      // Convert parts to API format
      const parts: MessagePart[] = msgParts.map((part) => {
        const basePart = {
          id: part.id,
          createdAt: this.unixToISO(part.createdAt)
        }

        switch (part.kind) {
          case 'text':
            return {
              ...basePart,
              kind: 'text' as const,
              content: part.contentText || '',
              metadata: part.metadata ? JSON.parse(part.metadata) : undefined
            }

          case 'tool_invocation': {
            const invocation = invocationsByPartId.get(part.id)
            return {
              ...basePart,
              kind: 'tool_invocation' as const,
              toolCallId: part.toolCallId!,
              toolName: part.toolName!,
              input: part.contentJson ? JSON.parse(part.contentJson) : undefined,
              inputText: part.contentText || undefined,
              status: (part.status as any) || 'pending',
              startedAt: invocation?.startedAt
                ? this.unixToISO(invocation.startedAt)
                : undefined,
              metadata: part.metadata ? JSON.parse(part.metadata) : undefined
            }
          }

          case 'tool_result':
            return {
              ...basePart,
              kind: 'tool_result' as const,
              relatedToolCallId: part.toolCallId!,
              output: part.contentJson ? JSON.parse(part.contentJson) : undefined,
              outputText: part.contentText || undefined,
              errorCode: part.errorCode || undefined,
              errorMessage: part.errorMessage || undefined,
              completedAt: this.unixToISO(part.updatedAt),
              metadata: part.metadata ? JSON.parse(part.metadata) : undefined
            }

          case 'attachment':
            return {
              ...basePart,
              kind: 'attachment' as const,
              mimeType: part.mimeType!,
              sizeBytes: part.sizeBytes || undefined,
              contentUrl: part.contentText || undefined,
              metadata: part.metadata ? JSON.parse(part.metadata) : undefined
            }

          case 'metadata':
            return {
              ...basePart,
              kind: 'metadata' as const,
              content: part.contentJson ? JSON.parse(part.contentJson) : undefined,
              metadata: part.metadata ? JSON.parse(part.metadata) : undefined
            }

          default:
            throw new Error(`Unknown part kind: ${part.kind}`)
        }
      })

      return {
        id: msg.id,
        sessionId: msg.sessionId,
        role: msg.role as any,
        state: msg.state as any,
        sequence: msg.sequence,
        createdAt: this.unixToISO(msg.createdAt),
        completedAt: msg.completedAt ? this.unixToISO(msg.completedAt) : undefined,
        inputTokens: msg.inputTokens || undefined,
        outputTokens: msg.outputTokens || undefined,
        error: msg.error ? JSON.parse(msg.error) : undefined,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined,
        parts
      }
    })

    return {
      id: session.id,
      title: session.title,
      createdAt: this.unixToISO(session.createdAt),
      updatedAt: this.unixToISO(session.updatedAt),
      lastMessageAt: session.lastMessageAt
        ? this.unixToISO(session.lastMessageAt)
        : undefined,
      providerConfigId: session.providerConfigId,
      modelId: session.modelId,
      dataSchemaVersion: session.dataSchemaVersion,
      messageCount: session.messageCount,
      pinnedAt: session.pinnedAt ? this.unixToISO(session.pinnedAt) : null,
      archivedAt: session.archivedAt ? this.unixToISO(session.archivedAt) : null,
      summary: session.summary ? JSON.parse(session.summary) : undefined,
      color: session.color,
      metadata: session.metadata ? JSON.parse(session.metadata) : undefined,
      messages
    }
  }

  // List sessions with optional filtering and sorting
  async listSessions(options?: ListSessionsOptions): Promise<ChatSessionRow[]> {
    const {
      limit,
      offset,
      sortBy = 'updatedAt',
      includeArchived = false
    } = options || {}

    let query = this.db.select().from(chatSessions)

    // Filter out archived sessions if needed
    if (!includeArchived) {
      query = query.where(sql`${chatSessions.archivedAt} IS NULL`) as any
    }

    // Apply sorting
    if (sortBy === 'updatedAt') {
      query = query.orderBy(desc(chatSessions.updatedAt)) as any
    } else if (sortBy === 'createdAt') {
      query = query.orderBy(desc(chatSessions.createdAt)) as any
    } else if (sortBy === 'title') {
      query = query.orderBy(chatSessions.title) as any
    }

    // Apply pagination
    if (limit) {
      query = query.limit(limit) as any
    }
    if (offset) {
      query = query.offset(offset) as any
    }

    return query as Promise<ChatSessionRow[]>
  }

  // Update session metadata
  async updateSession(sessionId: string, updates: SessionUpdates): Promise<void> {
    await this.db
      .update(chatSessions)
      .set({
        ...updates,
        updatedAt: Date.now()
      })
      .where(eq(chatSessions.id, sessionId))
  }

  // Delete a session (cascade deletes all related data)
  async deleteSession(sessionId: string): Promise<void> {
    await this.db.delete(chatSessions).where(eq(chatSessions.id, sessionId))
  }

  // Search sessions by title
  async searchSessions(query: string): Promise<ChatSessionRow[]> {
    return this.db
      .select()
      .from(chatSessions)
      .where(like(chatSessions.title, `%${query}%`))
      .orderBy(desc(chatSessions.updatedAt)) as Promise<ChatSessionRow[]>
  }

  // Add a message with parts to a session
  async addMessage(request: AddMessageRequest): Promise<string> {
    const messageId = randomUUID()
    const now = Date.now()

    // Use a transaction to ensure atomicity
    await this.db.transaction(async (tx) => {
      // Get current message count
      const sessionResult = await tx
        .select({ messageCount: chatSessions.messageCount })
        .from(chatSessions)
        .where(eq(chatSessions.id, request.sessionId))
        .limit(1)

      if (!sessionResult || sessionResult.length === 0) {
        throw new Error(`Session ${request.sessionId} not found`)
      }

      const currentCount = sessionResult[0].messageCount
      const sequence = currentCount + 1

      // Insert message
      await tx.insert(chatMessages).values({
        id: messageId,
        sessionId: request.sessionId,
        role: request.role,
        state: 'completed',
        sequence,
        createdAt: now,
        completedAt: now,
        inputTokens: request.inputTokens || null,
        outputTokens: request.outputTokens || null,
        error: request.error ? JSON.stringify(request.error) : null,
        metadata: request.metadata ? JSON.stringify(request.metadata) : null,
        parentMessageId: null,
        deletedAt: null
      })

      // Insert parts
      for (let i = 0; i < request.parts.length; i++) {
        const part = request.parts[i]
        const partId = randomUUID()

        const basePart = {
          id: partId,
          messageId,
          sessionId: request.sessionId,
          kind: part.kind,
          sequence: i,
          createdAt: now,
          updatedAt: now
        }

        if (part.kind === 'text') {
          await tx.insert(messageParts).values({
            ...basePart,
            contentText: part.content,
            contentJson: null,
            mimeType: null,
            sizeBytes: null,
            toolCallId: null,
            toolName: null,
            status: null,
            errorCode: null,
            errorMessage: null,
            relatedPartId: null,
            metadata: part.metadata ? JSON.stringify(part.metadata) : null
          })
        } else if (part.kind === 'tool_invocation') {
          await tx.insert(messageParts).values({
            ...basePart,
            contentText: part.inputText || null,
            contentJson: JSON.stringify(part.input),
            mimeType: null,
            sizeBytes: null,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            status: 'pending',
            errorCode: null,
            errorMessage: null,
            relatedPartId: null,
            metadata: part.metadata ? JSON.stringify(part.metadata) : null
          })

          // Create tool invocation record
          await tx.insert(toolInvocations).values({
            id: randomUUID(),
            sessionId: request.sessionId,
            messageId,
            invocationPartId: partId,
            resultPartId: null,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            inputJson: JSON.stringify(part.input),
            outputJson: null,
            status: 'pending',
            errorCode: null,
            errorMessage: null,
            latencyMs: null,
            startedAt: now,
            completedAt: null,
            createdAt: now,
            updatedAt: now
          })
        } else if (part.kind === 'tool_result') {
          await tx.insert(messageParts).values({
            ...basePart,
            contentText: part.outputText || null,
            contentJson: part.output ? JSON.stringify(part.output) : null,
            mimeType: null,
            sizeBytes: null,
            toolCallId: part.toolCallId,
            toolName: null,
            status: part.status || 'success',
            errorCode: null,
            errorMessage: null,
            relatedPartId: null,
            metadata: part.metadata ? JSON.stringify(part.metadata) : null
          })
        } else if (part.kind === 'attachment') {
          await tx.insert(messageParts).values({
            ...basePart,
            contentText: null,
            contentJson: part.contentJson ? JSON.stringify(part.contentJson) : null,
            mimeType: part.mimeType,
            sizeBytes: part.sizeBytes || null,
            toolCallId: null,
            toolName: null,
            status: null,
            errorCode: null,
            errorMessage: null,
            relatedPartId: null,
            metadata: part.metadata ? JSON.stringify(part.metadata) : null
          })
        } else if (part.kind === 'metadata') {
          await tx.insert(messageParts).values({
            ...basePart,
            contentText: null,
            contentJson: JSON.stringify(part.content),
            mimeType: null,
            sizeBytes: null,
            toolCallId: null,
            toolName: null,
            status: null,
            errorCode: null,
            errorMessage: null,
            relatedPartId: null,
            metadata: null
          })
        }
      }

      // Update session metadata
      await tx
        .update(chatSessions)
        .set({
          messageCount: sequence,
          lastMessageAt: now,
          updatedAt: now
        })
        .where(eq(chatSessions.id, request.sessionId))
    })

    return messageId
  }

  // Record tool invocation result
  async recordToolInvocationResult(
    request: RecordToolInvocationResultRequest
  ): Promise<void> {
    const now = Date.now()

    await this.db.transaction(async (tx) => {
      // Find the tool invocation
      const invocationResult = await tx
        .select()
        .from(toolInvocations)
        .where(eq(toolInvocations.toolCallId, request.toolCallId))
        .limit(1)

      if (!invocationResult || invocationResult.length === 0) {
        throw new Error(`Tool invocation ${request.toolCallId} not found`)
      }

      const invocation = invocationResult[0]

      // Check if we need to create a result part
      let resultPartId = invocation.resultPartId

      if (!resultPartId) {
        // Create a new tool_result part
        resultPartId = randomUUID()

        await tx.insert(messageParts).values({
          id: resultPartId,
          messageId: invocation.messageId,
          sessionId: invocation.sessionId,
          kind: 'tool_result',
          sequence: 999, // Will be updated later if needed
          contentText: request.outputText || null,
          contentJson: request.output ? JSON.stringify(request.output) : null,
          mimeType: null,
          sizeBytes: null,
          toolCallId: request.toolCallId,
          toolName: null,
          status: request.status,
          errorCode: request.errorCode || null,
          errorMessage: request.errorMessage || null,
          relatedPartId: invocation.invocationPartId,
          metadata: null,
          createdAt: now,
          updatedAt: now
        })
      }

      // Update the tool invocation
      await tx
        .update(toolInvocations)
        .set({
          resultPartId,
          outputJson: request.output ? JSON.stringify(request.output) : null,
          status: request.status,
          errorCode: request.errorCode || null,
          errorMessage: request.errorMessage || null,
          latencyMs: request.latencyMs || null,
          completedAt: now,
          updatedAt: now
        })
        .where(eq(toolInvocations.toolCallId, request.toolCallId))

      // Update only the tool_result part (not the tool_invocation part)
      await tx
        .update(messageParts)
        .set({
          status: request.status,
          contentText: request.outputText || null,
          contentJson: request.output ? JSON.stringify(request.output) : null,
          errorCode: request.errorCode || null,
          errorMessage: request.errorMessage || null,
          updatedAt: now
        })
        .where(and(
          eq(messageParts.toolCallId, request.toolCallId),
          eq(messageParts.kind, 'tool_result')
        ))
    })
  }

  // Delete messages after a specific message (for regeneration)
  async deleteMessagesAfter(sessionId: string, messageId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Get the message to find its createdAt
      const messageResult = await tx
        .select({ createdAt: chatMessages.createdAt })
        .from(chatMessages)
        .where(and(eq(chatMessages.id, messageId), eq(chatMessages.sessionId, sessionId)))
        .limit(1)

      if (!messageResult || messageResult.length === 0) {
        throw new Error(`Message ${messageId} not found in session ${sessionId}`)
      }

      const cutoffTime = messageResult[0].createdAt

      // Delete messages created after this one
      await tx
        .delete(chatMessages)
        .where(
          and(
            eq(chatMessages.sessionId, sessionId),
            sql`${chatMessages.createdAt} > ${cutoffTime}`
          )
        )

      // Recalculate message count
      const remainingMessages = await tx
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))

      await tx
        .update(chatSessions)
        .set({
          messageCount: remainingMessages.length,
          updatedAt: Date.now()
        })
        .where(eq(chatSessions.id, sessionId))
    })
  }

  // Get last active session ID
  async getLastSessionId(): Promise<string | null> {
    const result = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'lastSessionId'))
      .limit(1)

    if (!result || result.length === 0) {
      return null
    }

    return result[0].value as string
  }

  // Set last active session ID
  async setLastSessionId(sessionId: string): Promise<void> {
    await this.db
      .insert(settings)
      .values({
        key: 'lastSessionId',
        value: sessionId as any
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sessionId as any }
      })
  }
}
