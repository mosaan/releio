import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CompressionService } from '../CompressionService'
import { TokenCounter } from '../TokenCounter'
import { SummarizationService } from '../SummarizationService'
import { ChatSessionStore } from '@backend/session/ChatSessionStore'
import { ModelConfigService } from '../ModelConfigService'
import { createTestDatabaseWithChatTables } from '../../../../tests/backend/database-helper'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as path from 'path'
import * as fs from 'fs'

describe('Compression Integration Tests', () => {
  let service: CompressionService
  let tokenCounter: TokenCounter
  let summarizationService: SummarizationService
  let sessionStore: ChatSessionStore
  let modelConfigService: ModelConfigService
  let db: Awaited<ReturnType<typeof createTestDatabaseWithChatTables>>
  let configDb: ReturnType<typeof drizzle>

  beforeEach(async () => {
    // Setup main database for sessions
    db = await createTestDatabaseWithChatTables()
    sessionStore = new ChatSessionStore(db)

    // Setup separate database for model configs
    const configClient = createClient({ url: ':memory:' })
    configDb = drizzle({ client: configClient })

    // Run migrations for model configs
    const migrationsFolder = path.join(process.cwd(), 'resources', 'db', 'migrations')
    if (fs.existsSync(migrationsFolder)) {
      await migrate(configDb, { migrationsFolder })
    }

    // Initialize services
    tokenCounter = new TokenCounter()
    modelConfigService = new ModelConfigService(configDb)
    await modelConfigService.seedDefaults()

    // Mock summarization service
    summarizationService = {
      summarize: vi.fn()
    } as any

    // Create compression service
    service = new CompressionService(
      tokenCounter,
      summarizationService,
      sessionStore,
      modelConfigService
    )
  })

  afterEach(() => {
    tokenCounter.dispose()
    if (configDb?.$client) {
      configDb.$client.close()
    }
  })

  describe('Full Compression Workflow', () => {
    it('should compress a large conversation end-to-end', async () => {
      // Create session
      const sessionId = await sessionStore.createSession({ title: 'Large Conversation' })

      // Add many messages (50 messages = ~100 user/assistant pairs)
      for (let i = 0; i < 25; i++) {
        await sessionStore.addMessage({
          sessionId,
          role: 'user',
          parts: [
            {
              kind: 'text',
              content: `User message ${i + 1}. This is a longer message with substantial content to simulate a real conversation. `.repeat(
                5
              )
            }
          ]
        })
        await sessionStore.addMessage({
          sessionId,
          role: 'assistant',
          parts: [
            {
              kind: 'text',
              content: `Assistant response ${i + 1}. This is a detailed response with code examples and explanations. `.repeat(
                5
              )
            }
          ]
        })
      }

      // Mock summary
      ;(summarizationService.summarize as any).mockResolvedValue(
        '## Summary\nThis conversation covered 25 topics with detailed discussions and code examples.'
      )

      // Check context before compression
      const beforeCheck = await service.checkContext(sessionId, 'openai', 'gpt-4o')
      expect(beforeCheck.currentTokenCount).toBeGreaterThan(1000)

      // Compress
      const result = await service.autoCompress({
        sessionId,
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
        force: true,
        retentionTokenCount: 500 // Ensure some messages are compressed
      })

      // Verify compression succeeded
      expect(result.compressed).toBe(true)
      expect(result.summaryId).toBeDefined()
      expect(result.messagesCompressed).toBeGreaterThan(0)
      expect(result.newTokenCount).toBeLessThan(result.originalTokenCount)
      expect(result.compressionRatio).toBeGreaterThan(0)

      // Verify snapshot was created
      const snapshot = await sessionStore.getLatestSnapshot(sessionId, 'summary')
      expect(snapshot).not.toBeNull()
      expect(snapshot?.tokenCount).toBeGreaterThan(0)

      // Verify context now includes summary
      const context = await service.buildContextForAI(sessionId)
      expect(context[0].role).toBe('system') // First message should be summary
      expect(context.length).toBeLessThan(50) // Fewer messages than original
    })

    it('should handle conversation with tool invocations', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Tool Conversation' })

      // Add messages with tool calls
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Search for information about compression' }]
      })
      await sessionStore.addMessage({
        sessionId,
        role: 'assistant',
        parts: [
          { kind: 'text', content: 'Let me search for that.' },
          {
            kind: 'tool_invocation',
            toolCallId: 'call-1',
            toolName: 'web_search',
            input: { query: 'compression algorithms' }
          }
        ]
      })
      await sessionStore.addMessage({
        sessionId,
        role: 'tool',
        parts: [
          {
            kind: 'tool_result',
            toolCallId: 'call-1',
            output: { results: ['Result 1', 'Result 2'] }
          }
        ]
      })
      await sessionStore.addMessage({
        sessionId,
        role: 'assistant',
        parts: [
          { kind: 'text', content: 'Based on the search results, here is what I found...' }
        ]
      })

      // Mock summary
      ;(summarizationService.summarize as any).mockResolvedValue(
        '## Summary\nUser asked about compression. Assistant searched and provided results.'
      )

      // Compress
      const result = await service.autoCompress({
        sessionId,
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
        force: true,
        retentionTokenCount: 20 // Small budget to ensure tool messages are compressed
      })

      expect(result.compressed).toBe(true)
      expect(summarizationService.summarize).toHaveBeenCalled()

      // Verify tool invocations were included in summary
      const summarizeCall = (summarizationService.summarize as any).mock.calls[0][0]
      expect(summarizeCall.messages.some((m: any) => m.role === 'tool')).toBe(true)
    })
  })

  describe('Multi-Level Compression', () => {
    it('should perform multiple compressions and chain summaries', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Multi-Level Test' })

      // First batch of messages
      for (let i = 0; i < 10; i++) {
        await sessionStore.addMessage({
          sessionId,
          role: 'user',
          parts: [{ kind: 'text', content: `First batch message ${i + 1}. `.repeat(10) }]
        })
        await sessionStore.addMessage({
          sessionId,
          role: 'assistant',
          parts: [{ kind: 'text', content: `First batch response ${i + 1}. `.repeat(10) }]
        })
      }

      // First compression
      ;(summarizationService.summarize as any).mockResolvedValueOnce(
        '## Summary\nFirst batch: 10 messages about initial topics.'
      )
      const firstCompression = await service.autoCompress({
        sessionId,
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
        force: true,
        retentionTokenCount: 100
      })

      expect(firstCompression.compressed).toBe(true)
      const firstSnapshot = await sessionStore.getLatestSnapshot(sessionId, 'summary')
      expect(firstSnapshot).not.toBeNull()

      // Second batch of messages
      for (let i = 0; i < 10; i++) {
        await sessionStore.addMessage({
          sessionId,
          role: 'user',
          parts: [{ kind: 'text', content: `Second batch message ${i + 1}. `.repeat(10) }]
        })
        await sessionStore.addMessage({
          sessionId,
          role: 'assistant',
          parts: [{ kind: 'text', content: `Second batch response ${i + 1}. `.repeat(10) }]
        })
      }

      // Second compression (should include previous summary)
      ;(summarizationService.summarize as any).mockResolvedValueOnce(
        '## Summary\nCombined summary: First batch covered initial topics, second batch expanded on them.'
      )
      const secondCompression = await service.autoCompress({
        sessionId,
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
        force: true,
        retentionTokenCount: 100
      })

      expect(secondCompression.compressed).toBe(true)

      // Verify prompt included previous summary
      const secondCall = (summarizationService.summarize as any).mock.calls[1][0]
      expect(secondCall.promptTemplate).toContain('Previous Summary')

      // Verify latest snapshot is updated
      const secondSnapshot = await sessionStore.getLatestSnapshot(sessionId, 'summary')
      expect(secondSnapshot?.id).not.toBe(firstSnapshot?.id)
      expect(secondSnapshot?.content).toContain('Combined summary')

      // Verify all snapshots are accessible
      const allSnapshots = await sessionStore.getSnapshots(sessionId)
      expect(allSnapshots.length).toBe(2)
    })
  })

  describe('Error Handling', () => {
    it('should handle summarization failures gracefully', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Error Test' })
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Test message. '.repeat(20) }]
      })

      // Mock summarization error
      ;(summarizationService.summarize as any).mockRejectedValue(new Error('API error'))

      // Attempt compression
      await expect(
        service.autoCompress({
          sessionId,
          provider: 'openai',
          model: 'gpt-4o',
          apiKey: 'test-key',
          force: true,
          retentionTokenCount: 10
        })
      ).rejects.toThrow()

      // Verify no snapshot was created
      const snapshot = await sessionStore.getLatestSnapshot(sessionId, 'summary')
      expect(snapshot).toBeNull()
    })

    it('should handle non-existent session', async () => {
      await expect(
        service.checkContext('non-existent-session', 'openai', 'gpt-4o')
      ).rejects.toThrow()
    })

    it('should handle missing model configuration', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Test' })
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Test' }]
      })

      // Should use fallback config
      const result = await service.checkContext(sessionId, 'unknown-provider', 'unknown-model')
      expect(result).toBeDefined()
      expect(result.contextLimit).toBe(8000) // Fallback default
    })
  })

  describe('Performance', () => {
    it('should handle large conversations efficiently', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Performance Test' })

      // Add 100 messages
      for (let i = 0; i < 50; i++) {
        await sessionStore.addMessage({
          sessionId,
          role: 'user',
          parts: [{ kind: 'text', content: `Message ${i}. `.repeat(50) }]
        })
        await sessionStore.addMessage({
          sessionId,
          role: 'assistant',
          parts: [{ kind: 'text', content: `Response ${i}. `.repeat(50) }]
        })
      }

      // Measure context check performance
      const startCheck = Date.now()
      const checkResult = await service.checkContext(sessionId, 'openai', 'gpt-4o')
      const checkDuration = Date.now() - startCheck

      expect(checkDuration).toBeLessThan(1000) // Should complete within 1 second
      expect(checkResult.currentTokenCount).toBeGreaterThan(10000)
    })

    it('should count 100K tokens in reasonable time', () => {
      // Generate large text (approximately 100K tokens)
      const largeText = 'word '.repeat(100000)

      const startTime = Date.now()
      const count = tokenCounter.countText(largeText)
      const duration = Date.now() - startTime

      expect(count).toBeGreaterThan(10000)
      expect(duration).toBeLessThan(2000) // Should complete within 2 seconds
    })
  })

  describe('Compression Quality', () => {
    it('should achieve significant compression ratio', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Compression Quality' })

      // Add messages with redundant content
      for (let i = 0; i < 20; i++) {
        await sessionStore.addMessage({
          sessionId,
          role: 'user',
          parts: [
            {
              kind: 'text',
              content: `This is message ${i} with lots of repetitive content that should compress well. `.repeat(
                10
              )
            }
          ]
        })
        await sessionStore.addMessage({
          sessionId,
          role: 'assistant',
          parts: [
            {
              kind: 'text',
              content: `This is response ${i} with detailed explanations that can be summarized concisely. `.repeat(
                10
              )
            }
          ]
        })
      }

      // Mock compact summary
      ;(summarizationService.summarize as any).mockResolvedValue(
        '## Summary\n20 messages discussing repetitive topics with detailed explanations.'
      )

      const result = await service.autoCompress({
        sessionId,
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
        force: true,
        retentionTokenCount: 100
      })

      // Verify good compression ratio (should be > 50%)
      expect(result.compressionRatio).toBeGreaterThan(50)
      expect(result.newTokenCount).toBeLessThan(result.originalTokenCount * 0.5)
    })
  })
})
