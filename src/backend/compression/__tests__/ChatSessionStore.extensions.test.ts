import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabaseWithChatTables } from '../../../../tests/backend/database-helper'
import { ChatSessionStore } from '@backend/session/ChatSessionStore'

describe('ChatSessionStore - Compression Extensions', () => {
  let db: Awaited<ReturnType<typeof createTestDatabaseWithChatTables>>
  let store: ChatSessionStore

  beforeEach(async () => {
    db = await createTestDatabaseWithChatTables()
    store = new ChatSessionStore(db)
  })

  describe('createSnapshot', () => {
    it('should create a summary snapshot', async () => {
      // Create a session and message first
      const sessionId = await store.createSession({ title: 'Test Session' })
      const messageId = await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Test message' }]
      })

      const snapshotId = await store.createSnapshot({
        sessionId,
        kind: 'summary',
        content: { text: 'This is a summary of the conversation' },
        messageCutoffId: messageId,
        tokenCount: 100
      })

      expect(snapshotId).toBeDefined()
      expect(typeof snapshotId).toBe('string')
    })

    it('should store snapshot with correct data', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })
      const messageId = await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Test' }]
      })

      const summaryContent = { text: 'Summary of conversation', details: ['Point 1', 'Point 2'] }
      await store.createSnapshot({
        sessionId,
        kind: 'summary',
        content: summaryContent,
        messageCutoffId: messageId,
        tokenCount: 50
      })

      const snapshot = await store.getLatestSnapshot(sessionId, 'summary')
      expect(snapshot).not.toBeNull()
      expect(snapshot?.content).toEqual(summaryContent)
      expect(snapshot?.tokenCount).toBe(50)
      expect(snapshot?.messageCutoffId).toBe(messageId)
    })
  })

  describe('getLatestSnapshot', () => {
    it('should return null when no snapshots exist', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })

      const snapshot = await store.getLatestSnapshot(sessionId, 'summary')
      expect(snapshot).toBeNull()
    })

    it('should return the most recent snapshot', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })
      const messageId = await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Test' }]
      })

      // Create multiple snapshots
      await store.createSnapshot({
        sessionId,
        kind: 'summary',
        content: { text: 'First summary' },
        messageCutoffId: messageId,
        tokenCount: 50
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      await store.createSnapshot({
        sessionId,
        kind: 'summary',
        content: { text: 'Second summary' },
        messageCutoffId: messageId,
        tokenCount: 60
      })

      const snapshot = await store.getLatestSnapshot(sessionId, 'summary')
      expect(snapshot?.content.text).toBe('Second summary')
      expect(snapshot?.tokenCount).toBe(60)
    })
  })

  describe('getSnapshots', () => {
    it('should return empty array when no snapshots exist', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })

      const snapshots = await store.getSnapshots(sessionId)
      expect(snapshots).toEqual([])
    })

    it('should return all snapshots for a session', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })
      const messageId = await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Test' }]
      })

      await store.createSnapshot({
        sessionId,
        kind: 'summary',
        content: { text: 'First' },
        messageCutoffId: messageId,
        tokenCount: 50
      })

      await store.createSnapshot({
        sessionId,
        kind: 'summary',
        content: { text: 'Second' },
        messageCutoffId: messageId,
        tokenCount: 60
      })

      const snapshots = await store.getSnapshots(sessionId)
      expect(snapshots.length).toBe(2)
    })

    it('should return snapshots in descending order by creation time', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })
      const messageId = await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Test' }]
      })

      await store.createSnapshot({
        sessionId,
        kind: 'summary',
        content: { text: 'First' },
        messageCutoffId: messageId,
        tokenCount: 50
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      await store.createSnapshot({
        sessionId,
        kind: 'summary',
        content: { text: 'Second' },
        messageCutoffId: messageId,
        tokenCount: 60
      })

      const snapshots = await store.getSnapshots(sessionId)
      expect(snapshots[0].content.text).toBe('Second') // Most recent first
      expect(snapshots[1].content.text).toBe('First')
    })
  })

  describe('updateMessageTokens', () => {
    it('should update message token counts', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })
      const messageId = await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Test message' }]
      })

      await store.updateMessageTokens(messageId, 100, 50)

      const session = await store.getSession(sessionId)
      const updatedMessage = session?.messages.find((m) => m.id === messageId)

      expect(updatedMessage?.inputTokens).toBe(100)
      expect(updatedMessage?.outputTokens).toBe(50)
    })

    it('should allow updating tokens multiple times', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })
      const messageId = await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Test' }]
      })

      await store.updateMessageTokens(messageId, 100, 50)
      await store.updateMessageTokens(messageId, 200, 75)

      const session = await store.getSession(sessionId)
      const updatedMessage = session?.messages.find((m) => m.id === messageId)

      expect(updatedMessage?.inputTokens).toBe(200)
      expect(updatedMessage?.outputTokens).toBe(75)
    })
  })

  describe('buildAIContext', () => {
    it('should return all messages when no snapshot exists', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })
      await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 1' }]
      })
      await store.addMessage({
        sessionId,
        role: 'assistant',
        parts: [{ kind: 'text', content: 'Response 1' }]
      })

      const context = await store.buildAIContext(sessionId)

      expect(context.length).toBe(2)
      expect(context[0].role).toBe('user')
      expect(context[1].role).toBe('assistant')
    })

    it('should return summary + messages after cutoff when snapshot exists', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })

      // Add multiple messages
      const msg1 = await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 1' }]
      })
      await store.addMessage({
        sessionId,
        role: 'assistant',
        parts: [{ kind: 'text', content: 'Response 1' }]
      })
      const msg3 = await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 2' }]
      })
      await store.addMessage({
        sessionId,
        role: 'assistant',
        parts: [{ kind: 'text', content: 'Response 2' }]
      })

      // Create snapshot with cutoff at msg1
      await store.createSnapshot({
        sessionId,
        kind: 'summary',
        content: 'Summary of early conversation',
        messageCutoffId: msg1,
        tokenCount: 100
      })

      const context = await store.buildAIContext(sessionId)

      // Should have: summary + response1 + msg3 + response2 (messages after msg1)
      expect(context.length).toBe(4)
      expect(context[0].role).toBe('system') // Summary message
      expect(context[0].parts[0].kind).toBe('text')
      expect((context[0].parts[0] as any).content).toContain('Summary')
      expect(context[1].role).toBe('assistant') // response1
      expect(context[2].id).toBe(msg3) // msg3
      expect(context[3].role).toBe('assistant') // response2
    })

    it('should handle empty session', async () => {
      const sessionId = await store.createSession({ title: 'Empty Session' })

      const context = await store.buildAIContext(sessionId)
      expect(context).toEqual([])
    })

    it('should include all messages after cutoff in context', async () => {
      const sessionId = await store.createSession({ title: 'Test Session' })
      await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 1' }]
      })
      const msg2 = await store.addMessage({
        sessionId,
        role: 'assistant',
        parts: [{ kind: 'text', content: 'Response 1' }]
      })
      const msg3 = await store.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 2' }]
      })

      // Create snapshot with cutoff at msg2 (response1)
      await store.createSnapshot({
        sessionId,
        kind: 'summary',
        content: 'Summary of conversation up to response1',
        messageCutoffId: msg2,
        tokenCount: 50
      })

      const context = await store.buildAIContext(sessionId)

      // Should have summary + msg3 (messages after msg2)
      expect(context.length).toBe(2)
      expect(context[0].role).toBe('system') // Summary
      expect(context[1].id).toBe(msg3) // Only msg3 after cutoff
    })
  })
})
