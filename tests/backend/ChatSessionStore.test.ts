import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabaseWithChatTables } from './database-helper'
import { ChatSessionStore } from '@backend/session/ChatSessionStore'
import { chatSessions, chatMessages, messageParts, toolInvocations } from '@backend/db/schema'
import { eq } from 'drizzle-orm'
import type { AddMessageRequest } from '@common/chat-types'

describe('ChatSessionStore', () => {
  let store: ChatSessionStore
  let db: Awaited<ReturnType<typeof createTestDatabaseWithChatTables>>

  beforeEach(async () => {
    db = await createTestDatabaseWithChatTables()
    store = new ChatSessionStore(db)
  })

  describe('createSession', () => {
    it('should create a session and return UUID', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })

      expect(sessionId).toBeDefined()
      expect(typeof sessionId).toBe('string')
      expect(sessionId.length).toBeGreaterThan(0)

      // Verify session exists in database
      const result = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId))

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Test Session')
      expect(result[0].messageCount).toBe(0)
    })

    it('should create session with default title', async () => {
      const sessionId = await store.createSession({})

      const result = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId))

      expect(result[0].title).toBe('New Chat')
    })

    it('should create session with provider and model config', async () => {
      const sessionId = await store.createSession({
        title: 'Test',
        providerConfigId: 'provider-1',
        modelId: 'model-1',
        color: '#ff0000'
      })

      const result = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId))

      expect(result[0].providerConfigId).toBe('provider-1')
      expect(result[0].modelId).toBe('model-1')
      expect(result[0].color).toBe('#ff0000')
    })
  })

  describe('getSession', () => {
    it('should return null for non-existent session', async () => {
      const result = await store.getSession('non-existent-id')

      expect(result).toBeNull()
    })

    it('should return session with empty messages', async () => {
      const sessionId = await store.createSession({ title: 'Empty Session' })

      const result = await store.getSession(sessionId)

      expect(result).toBeDefined()
      expect(result?.id).toBe(sessionId)
      expect(result?.title).toBe('Empty Session')
      expect(result?.messages).toEqual([])
    })
  })

  describe('addMessage', () => {
    it('should add message with text part', async () => {
      const sessionId = await store.createSession({ title: 'Test' })

      const request: AddMessageRequest = {
        sessionId,
        role: 'user',
        parts: [
          {
            kind: 'text',
            content: 'Hello world'
          }
        ]
      }

      const messageId = await store.addMessage(request)

      expect(messageId).toBeDefined()

      // Verify message exists
      const messages = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId))

      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].sequence).toBe(1)

      // Verify part exists
      const parts = await db
        .select()
        .from(messageParts)
        .where(eq(messageParts.messageId, messageId))

      expect(parts).toHaveLength(1)
      expect(parts[0].kind).toBe('text')
      expect(parts[0].contentText).toBe('Hello world')

      // Verify session was updated
      const session = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId))

      expect(session[0].messageCount).toBe(1)
    })

    it('should add message with tool_invocation part', async () => {
      const sessionId = await store.createSession({ title: 'Test' })

      const request: AddMessageRequest = {
        sessionId,
        role: 'assistant',
        parts: [
          {
            kind: 'tool_invocation',
            toolCallId: 'call-123',
            toolName: 'test_tool',
            input: { arg1: 'value1' }
          }
        ]
      }

      const messageId = await store.addMessage(request)

      // Verify part exists with tool info
      const parts = await db
        .select()
        .from(messageParts)
        .where(eq(messageParts.messageId, messageId))

      expect(parts).toHaveLength(1)
      expect(parts[0].kind).toBe('tool_invocation')
      expect(parts[0].toolCallId).toBe('call-123')
      expect(parts[0].toolName).toBe('test_tool')
      expect(parts[0].status).toBe('pending')

      // Verify tool invocation was created
      const invocations = await db
        .select()
        .from(toolInvocations)
        .where(eq(toolInvocations.toolCallId, 'call-123'))

      expect(invocations).toHaveLength(1)
      expect(invocations[0].status).toBe('pending')
      expect(invocations[0].toolName).toBe('test_tool')
    })

    it('should increment message sequence correctly', async () => {
      const sessionId = await store.createSession({ title: 'Test' })

      // Add first message
      await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 1' }]
      })

      // Add second message
      await store.addMessage({
        sessionId,
        role: 'assistant',
        parts: [{ kind: 'text', content: 'Message 2' }]
      })

      // Verify sequences
      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(chatMessages.sequence)

      expect(messages).toHaveLength(2)
      expect(messages[0].sequence).toBe(1)
      expect(messages[1].sequence).toBe(2)
    })
  })

  describe('recordToolInvocationResult', () => {
    it('should record successful tool invocation result', async () => {
      const sessionId = await store.createSession({ title: 'Test' })

      // Add message with tool invocation
      await store.addMessage({
        sessionId,
        role: 'assistant',
        parts: [
          {
            kind: 'tool_invocation',
            toolCallId: 'call-456',
            toolName: 'test_tool',
            input: { arg1: 'value1' }
          }
        ]
      })

      // Record result
      await store.recordToolInvocationResult({
        toolCallId: 'call-456',
        status: 'success',
        output: { result: 'success data' },
        latencyMs: 100
      })

      // Verify invocation was updated
      const invocations = await db
        .select()
        .from(toolInvocations)
        .where(eq(toolInvocations.toolCallId, 'call-456'))

      expect(invocations).toHaveLength(1)
      expect(invocations[0].status).toBe('success')
      expect(JSON.parse(invocations[0].outputJson!)).toEqual({ result: 'success data' })
      expect(invocations[0].latencyMs).toBe(100)
      expect(invocations[0].completedAt).toBeDefined()
    })

    it('should record failed tool invocation result', async () => {
      const sessionId = await store.createSession({ title: 'Test' })

      // Add message with tool invocation
      await store.addMessage({
        sessionId,
        role: 'assistant',
        parts: [
          {
            kind: 'tool_invocation',
            toolCallId: 'call-789',
            toolName: 'test_tool',
            input: {}
          }
        ]
      })

      // Record error result
      await store.recordToolInvocationResult({
        toolCallId: 'call-789',
        status: 'error',
        errorCode: 'TOOL_ERROR',
        errorMessage: 'Tool execution failed'
      })

      // Verify invocation was updated
      const invocations = await db
        .select()
        .from(toolInvocations)
        .where(eq(toolInvocations.toolCallId, 'call-789'))

      expect(invocations[0].status).toBe('error')
      expect(invocations[0].errorCode).toBe('TOOL_ERROR')
      expect(invocations[0].errorMessage).toBe('Tool execution failed')
    })
  })

  describe('getSession with messages', () => {
    it('should retrieve session with messages and parts', async () => {
      const sessionId = await store.createSession({ title: 'Full Session' })

      // Add user message
      await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Hello' }]
      })

      // Add assistant message with tool invocation
      await store.addMessage({
        sessionId,
        role: 'assistant',
        parts: [
          {
            kind: 'tool_invocation',
            toolCallId: 'call-get',
            toolName: 'test_tool',
            input: { test: true }
          }
        ]
      })

      // Record tool result
      await store.recordToolInvocationResult({
        toolCallId: 'call-get',
        status: 'success',
        output: { data: 'result' }
      })

      // Get session
      const result = await store.getSession(sessionId)

      expect(result).toBeDefined()
      expect(result?.messages).toHaveLength(2)

      // Check first message
      expect(result?.messages[0].role).toBe('user')
      expect(result?.messages[0].parts).toHaveLength(1)
      expect(result?.messages[0].parts[0].kind).toBe('text')
      if (result?.messages[0].parts[0].kind === 'text') {
        expect(result.messages[0].parts[0].content).toBe('Hello')
      }

      // Check second message
      expect(result?.messages[1].role).toBe('assistant')
      expect(result?.messages[1].parts).toHaveLength(1)
      expect(result?.messages[1].parts[0].kind).toBe('tool_invocation')
    })
  })

  describe('deleteSession', () => {
    it('should delete session', async () => {
      const sessionId = await store.createSession({ title: 'To Delete' })

      await store.deleteSession(sessionId)

      // Verify session is gone
      const result = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId))

      expect(result).toHaveLength(0)
    })

    it('should cascade delete messages and parts', async () => {
      const sessionId = await store.createSession({ title: 'Cascade Test' })

      // Add a message
      const messageId = await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Test' }]
      })

      // Delete session
      await store.deleteSession(sessionId)

      // Verify message is deleted
      const messages = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId))

      expect(messages).toHaveLength(0)

      // Verify parts are deleted
      const parts = await db
        .select()
        .from(messageParts)
        .where(eq(messageParts.sessionId, sessionId))

      expect(parts).toHaveLength(0)
    })

    it('should cascade delete tool invocations', async () => {
      const sessionId = await store.createSession({ title: 'Tool Test' })

      // Add message with tool
      await store.addMessage({
        sessionId,
        role: 'assistant',
        parts: [
          {
            kind: 'tool_invocation',
            toolCallId: 'cascade-tool',
            toolName: 'test',
            input: {}
          }
        ]
      })

      // Delete session
      await store.deleteSession(sessionId)

      // Verify tool invocations are deleted
      const invocations = await db
        .select()
        .from(toolInvocations)
        .where(eq(toolInvocations.sessionId, sessionId))

      expect(invocations).toHaveLength(0)
    })
  })

  describe('listSessions', () => {
    it('should list sessions sorted by updatedAt', async () => {
      // Create multiple sessions with slight delays
      const id1 = await store.createSession({ title: 'Session 1' })
      await new Promise((resolve) => setTimeout(resolve, 10))
      const id2 = await store.createSession({ title: 'Session 2' })
      await new Promise((resolve) => setTimeout(resolve, 10))
      const id3 = await store.createSession({ title: 'Session 3' })

      const sessions = await store.listSessions()

      expect(sessions).toHaveLength(3)
      // Most recent first
      expect(sessions[0].id).toBe(id3)
      expect(sessions[1].id).toBe(id2)
      expect(sessions[2].id).toBe(id1)
    })

    it('should apply limit and offset', async () => {
      // Create 5 sessions
      for (let i = 0; i < 5; i++) {
        await store.createSession({ title: `Session ${i}` })
      }

      const limited = await store.listSessions({ limit: 2 })

      expect(limited).toHaveLength(2)

      const offset = await store.listSessions({ limit: 2, offset: 2 })

      expect(offset).toHaveLength(2)
    })
  })

  describe('updateSession', () => {
    it('should update session title', async () => {
      const sessionId = await store.createSession({ title: 'Original' })

      await store.updateSession(sessionId, { title: 'Updated' })

      const result = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId))

      expect(result[0].title).toBe('Updated')
    })
  })

  describe('searchSessions', () => {
    it('should search sessions by title', async () => {
      await store.createSession({ title: 'Project A' })
      await store.createSession({ title: 'Project B' })
      await store.createSession({ title: 'Meeting Notes' })

      const results = await store.searchSessions('Project')

      expect(results).toHaveLength(2)
      expect(results.every((s) => s.title.includes('Project'))).toBe(true)
    })
  })

  describe('lastSessionId', () => {
    it('should get and set last session ID', async () => {
      const sessionId = await store.createSession({ title: 'Test' })

      await store.setLastSessionId(sessionId)

      const retrieved = await store.getLastSessionId()

      expect(retrieved).toBe(sessionId)
    })

    it('should return null if no last session ID', async () => {
      const retrieved = await store.getLastSessionId()

      expect(retrieved).toBeNull()
    })
  })
})
