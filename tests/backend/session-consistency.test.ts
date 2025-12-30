import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestDatabaseWithChatTables } from './database-helper'
import { ChatSessionStore } from '@backend/session/ChatSessionStore'
import { MastraChatService } from '@backend/mastra/MastraChatService'
import { randomUUID } from 'crypto'

describe('Session Consistency', () => {
  describe('Handler Logic (Simulation)', () => {
    let store: ChatSessionStore
    let db: Awaited<ReturnType<typeof createTestDatabaseWithChatTables>>
    let mockMastraService: { startSession: any }

    beforeEach(async () => {
      db = await createTestDatabaseWithChatTables()
      store = new ChatSessionStore(db)
      mockMastraService = {
        startSession: vi.fn()
      }
    })

    // Simulate Handler.startMastraSession logic
    const startMastraSession = async (sessionId: string) => {
      if (!sessionId) {
        return { ok: false, error: 'Session ID is required' }
      }

      const dbSession = await store.getSession(sessionId)
      if (!dbSession) {
        return { ok: false, error: `Database session ${sessionId} not found` }
      }

      // Call service
      await mockMastraService.startSession(sessionId)
      return { ok: true, value: { sessionId } }
    }

    it('should allow Mastra session creation when DB session exists', async () => {
      const dbSessionId = await store.createSession({ title: 'Test' })

      mockMastraService.startSession.mockResolvedValue({
        sessionId: dbSessionId,
        threadId: 'thread-1',
        resourceId: 'default',
        history: []
      })

      const result = await startMastraSession(dbSessionId)

      expect(result.ok).toBe(true)
      expect(mockMastraService.startSession).toHaveBeenCalledWith(dbSessionId)
    })

    it('should reject Mastra session creation when DB session is missing', async () => {
      const fakeSessionId = randomUUID()

      const result = await startMastraSession(fakeSessionId)

      expect(result.ok).toBe(false)
      expect(result.error).toContain('not found')
      expect(mockMastraService.startSession).not.toHaveBeenCalled()
    })
  })

  describe('MastraChatService', () => {
    let service: MastraChatService

    beforeEach(() => {
      service = new MastraChatService()
      // Mock ensureAgent to avoid real agent creation
      // @ts-ignore - Accessing private method for mocking
      service['ensureAgent'] = vi.fn().mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'key'
      })
      // Mock loadTools to avoid filesystem/DB access
      // @ts-ignore
      service['loadTools'] = vi.fn().mockResolvedValue({})
    })

    it('should throw if sessionId is missing', async () => {
      // @ts-ignore - Testing invalid input
      await expect(service.startSession('')).rejects.toThrow('Session ID is required')
      // @ts-ignore
      await expect(service.startSession(null)).rejects.toThrow('Session ID is required')
      // @ts-ignore
      await expect(service.startSession(undefined)).rejects.toThrow('Session ID is required')
    })

    it('should use provided sessionId', async () => {
      const sessionId = 'test-session-id'
      const session = await service.startSession(sessionId)
      expect(session.sessionId).toBe(sessionId)
    })

    it('should reuse existing session if same ID provided', async () => {
      const sessionId = 'reuse-test-id'
      const session1 = await service.startSession(sessionId)

      // Add some history to verify it's the same object
      session1.history.push({ role: 'user', content: 'test' })

      const session2 = await service.startSession(sessionId)
      expect(session2).toBe(session1)
      expect(session2.history).toHaveLength(1)
    })

    it('should support getSession lookup', async () => {
      const sessionId = 'lookup-test-id'
      await service.startSession(sessionId)

      const session = service.getSession(sessionId)
      expect(session).toBeDefined()
      expect(session?.sessionId).toBe(sessionId)
    })

    it('should return null for non-existent session lookup', () => {
      const session = service.getSession('non-existent')
      expect(session).toBeNull()
    })
  })
})
