import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CompressionService } from '../CompressionService'
import { TokenCounter } from '../TokenCounter'
import { SummarizationService } from '../SummarizationService'
import { ChatSessionStore } from '@backend/session/ChatSessionStore'
import { ModelConfigService, type ModelConfig } from '../ModelConfigService'
import { createTestDatabaseWithChatTables } from '../../../../tests/backend/database-helper'
import type { ChatMessageWithParts } from '@common/chat-types'

describe('CompressionService', () => {
  let service: CompressionService
  let tokenCounter: TokenCounter
  let summarizationService: SummarizationService
  let sessionStore: ChatSessionStore
  let modelConfigService: ModelConfigService
  let db: Awaited<ReturnType<typeof createTestDatabaseWithChatTables>>

  beforeEach(async () => {
    // Setup database and stores
    db = await createTestDatabaseWithChatTables()
    sessionStore = new ChatSessionStore(db)

    // Create real token counter
    tokenCounter = new TokenCounter()

    // Mock summarization service
    summarizationService = {
      summarize: vi.fn()
    } as any

    // Mock model config service
    modelConfigService = {
      getConfig: vi.fn()
    } as any

    // Create service
    service = new CompressionService(
      tokenCounter,
      summarizationService,
      sessionStore,
      modelConfigService
    )
  })

  afterEach(() => {
    tokenCounter.dispose()
  })

  describe('checkContext', () => {
    it('should analyze context and determine compression need', async () => {
      // Create session with messages
      const sessionId = await sessionStore.createSession({ title: 'Test Session' })
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Hello, this is a test message.' }]
      })
      await sessionStore.addMessage({
        sessionId,
        role: 'assistant',
        parts: [{ kind: 'text', content: 'Hi! How can I help you today?' }]
      })

      // Mock model config
      const mockConfig: ModelConfig = {
        id: 'openai:gpt-4o',
        provider: 'openai',
        model: 'gpt-4o',
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        defaultCompressionThreshold: 0.95,
        recommendedRetentionTokens: 8000,
        source: 'default',
        lastUpdated: new Date(),
        createdAt: new Date()
      }
      ;(modelConfigService.getConfig as any).mockResolvedValue(mockConfig)

      const result = await service.checkContext(sessionId, 'openai', 'gpt-4o')

      expect(result).toBeDefined()
      expect(result.needsCompression).toBe(false) // Small conversation
      expect(result.currentTokenCount).toBeGreaterThan(0)
      expect(result.contextLimit).toBe(128000)
      expect(result.thresholdTokenCount).toBe(128000 * 0.95)
      expect(result.utilizationPercentage).toBeLessThan(1)
      expect(result.retentionTokenBudget).toBe(8000)
    })

    it('should include additional input in token count', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Test Session' })
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Short message' }]
      })

      const mockConfig: ModelConfig = {
        id: 'openai:gpt-4o',
        provider: 'openai',
        model: 'gpt-4o',
        maxInputTokens: 100,
        maxOutputTokens: 50,
        defaultCompressionThreshold: 0.5,
        recommendedRetentionTokens: 20,
        source: 'default',
        lastUpdated: new Date(),
        createdAt: new Date()
      }
      ;(modelConfigService.getConfig as any).mockResolvedValue(mockConfig)

      const withoutInput = await service.checkContext(sessionId, 'openai', 'gpt-4o')
      const withInput = await service.checkContext(
        sessionId,
        'openai',
        'gpt-4o',
        'This is additional input text that adds more tokens to the context.'
      )

      expect(withInput.currentTokenCount).toBeGreaterThan(withoutInput.currentTokenCount)
    })

    it('should indicate compression needed when threshold exceeded', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Test Session' })

      // Add many messages to exceed threshold
      for (let i = 0; i < 10; i++) {
        await sessionStore.addMessage({
          sessionId,
          role: 'user',
          parts: [
            {
              kind: 'text',
              content: 'This is a longer message with more content to increase token count. '.repeat(
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
              content: 'This is a response with substantial content to add tokens. '.repeat(5)
            }
          ]
        })
      }

      // Use low limits to trigger compression
      const mockConfig: ModelConfig = {
        id: 'test:model',
        provider: 'test',
        model: 'model',
        maxInputTokens: 1000,
        maxOutputTokens: 500,
        defaultCompressionThreshold: 0.5,
        recommendedRetentionTokens: 200,
        source: 'default',
        lastUpdated: new Date(),
        createdAt: new Date()
      }
      ;(modelConfigService.getConfig as any).mockResolvedValue(mockConfig)

      const result = await service.checkContext(sessionId, 'test', 'model')

      expect(result.needsCompression).toBe(true)
      expect(result.currentTokenCount).toBeGreaterThan(result.thresholdTokenCount)
    })
  })

  describe('autoCompress', () => {
    it('should not compress when below threshold', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Test Session' })
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Short message' }]
      })

      const mockConfig: ModelConfig = {
        id: 'openai:gpt-4o',
        provider: 'openai',
        model: 'gpt-4o',
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        defaultCompressionThreshold: 0.95,
        recommendedRetentionTokens: 8000,
        source: 'default',
        lastUpdated: new Date(),
        createdAt: new Date()
      }
      ;(modelConfigService.getConfig as any).mockResolvedValue(mockConfig)

      const result = await service.autoCompress({
        sessionId,
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key'
      })

      expect(result.compressed).toBe(false)
      expect(result.messagesCompressed).toBe(0)
      expect(summarizationService.summarize).not.toHaveBeenCalled()
    })

    it('should compress when threshold exceeded', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Test Session' })

      // Add messages
      for (let i = 0; i < 5; i++) {
        await sessionStore.addMessage({
          sessionId,
          role: 'user',
          parts: [{ kind: 'text', content: `Message ${i + 1}. `.repeat(20) }]
        })
        await sessionStore.addMessage({
          sessionId,
          role: 'assistant',
          parts: [{ kind: 'text', content: `Response ${i + 1}. `.repeat(20) }]
        })
      }

      const mockConfig: ModelConfig = {
        id: 'test:model',
        provider: 'test',
        model: 'model',
        maxInputTokens: 500,
        maxOutputTokens: 200,
        defaultCompressionThreshold: 0.3,
        recommendedRetentionTokens: 100,
        source: 'default',
        lastUpdated: new Date(),
        createdAt: new Date()
      }
      ;(modelConfigService.getConfig as any).mockResolvedValue(mockConfig)
      ;(summarizationService.summarize as any).mockResolvedValue(
        '## Summary\nThis is a test summary of the conversation.'
      )

      const result = await service.autoCompress({
        sessionId,
        provider: 'test',
        model: 'model',
        apiKey: 'test-key'
      })

      expect(result.compressed).toBe(true)
      expect(result.messagesCompressed).toBeGreaterThan(0)
      expect(result.summaryId).toBeDefined()
      expect(result.summary).toContain('Summary')
      expect(result.newTokenCount).toBeLessThan(result.originalTokenCount)
      expect(result.compressionRatio).toBeGreaterThan(0)
      expect(summarizationService.summarize).toHaveBeenCalled()
    })

    it('should force compression when force=true', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Test Session' })
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 1. '.repeat(10) }]
      })
      await sessionStore.addMessage({
        sessionId,
        role: 'assistant',
        parts: [{ kind: 'text', content: 'Response 1. '.repeat(10) }]
      })
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 2. '.repeat(10) }]
      })

      const mockConfig: ModelConfig = {
        id: 'openai:gpt-4o',
        provider: 'openai',
        model: 'gpt-4o',
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        defaultCompressionThreshold: 0.95,
        recommendedRetentionTokens: 30, // Small budget to ensure compression
        source: 'default',
        lastUpdated: new Date(),
        createdAt: new Date()
      }
      ;(modelConfigService.getConfig as any).mockResolvedValue(mockConfig)
      ;(summarizationService.summarize as any).mockResolvedValue('## Summary\nForced summary')

      const result = await service.autoCompress({
        sessionId,
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
        force: true
      })

      expect(result.compressed).toBe(true)
      expect(summarizationService.summarize).toHaveBeenCalled()
    })

    it('should handle empty session', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Empty Session' })

      const mockConfig: ModelConfig = {
        id: 'openai:gpt-4o',
        provider: 'openai',
        model: 'gpt-4o',
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        defaultCompressionThreshold: 0.95,
        recommendedRetentionTokens: 8000,
        source: 'default',
        lastUpdated: new Date(),
        createdAt: new Date()
      }
      ;(modelConfigService.getConfig as any).mockResolvedValue(mockConfig)

      const result = await service.autoCompress({
        sessionId,
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key'
      })

      expect(result.compressed).toBe(false)
      expect(result.originalTokenCount).toBe(0)
      expect(result.messagesCompressed).toBe(0)
    })

    it('should include existing summary in multi-level compression', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Test Session' })

      // Add initial messages
      for (let i = 0; i < 3; i++) {
        await sessionStore.addMessage({
          sessionId,
          role: 'user',
          parts: [{ kind: 'text', content: `Old message ${i + 1}. `.repeat(20) }]
        })
      }

      const firstMsgId = (
        await sessionStore.addMessage({
          sessionId,
          role: 'assistant',
          parts: [{ kind: 'text', content: 'Old response. '.repeat(20) }]
        })
      ) as string

      // Create initial summary
      await sessionStore.createSnapshot({
        sessionId,
        kind: 'summary',
        content: 'Previous summary of old messages',
        messageCutoffId: firstMsgId,
        tokenCount: 50
      })

      // Add new messages
      for (let i = 0; i < 3; i++) {
        await sessionStore.addMessage({
          sessionId,
          role: 'user',
          parts: [{ kind: 'text', content: `New message ${i + 1}. `.repeat(20) }]
        })
      }

      const mockConfig: ModelConfig = {
        id: 'test:model',
        provider: 'test',
        model: 'model',
        maxInputTokens: 500,
        maxOutputTokens: 200,
        defaultCompressionThreshold: 0.3,
        recommendedRetentionTokens: 100,
        source: 'default',
        lastUpdated: new Date(),
        createdAt: new Date()
      }
      ;(modelConfigService.getConfig as any).mockResolvedValue(mockConfig)
      ;(summarizationService.summarize as any).mockResolvedValue(
        '## Summary\nCombined summary with previous context'
      )

      const result = await service.autoCompress({
        sessionId,
        provider: 'test',
        model: 'model',
        apiKey: 'test-key',
        force: true
      })

      expect(result.compressed).toBe(true)
      // Check that the prompt included previous summary
      const summarizeCall = (summarizationService.summarize as any).mock.calls[0][0]
      expect(summarizeCall.promptTemplate).toContain('Previous Summary')
    })
  })

  describe('manualCompress', () => {
    it('should compress regardless of threshold', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Test Session' })
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 1. '.repeat(10) }]
      })
      await sessionStore.addMessage({
        sessionId,
        role: 'assistant',
        parts: [{ kind: 'text', content: 'Response 1. '.repeat(10) }]
      })
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 2. '.repeat(10) }]
      })

      const mockConfig: ModelConfig = {
        id: 'openai:gpt-4o',
        provider: 'openai',
        model: 'gpt-4o',
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        defaultCompressionThreshold: 0.95,
        recommendedRetentionTokens: 30, // Small budget to ensure compression
        source: 'default',
        lastUpdated: new Date(),
        createdAt: new Date()
      }
      ;(modelConfigService.getConfig as any).mockResolvedValue(mockConfig)
      ;(summarizationService.summarize as any).mockResolvedValue('## Summary\nManual summary')

      const result = await service.manualCompress({
        sessionId,
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key'
      })

      expect(result.compressed).toBe(true)
      expect(summarizationService.summarize).toHaveBeenCalled()
    })
  })

  describe('buildContextForAI', () => {
    it('should return messages from session store', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Test Session' })
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Test message' }]
      })

      const context = await service.buildContextForAI(sessionId)

      expect(context).toBeDefined()
      expect(context.length).toBe(1)
      expect(context[0].role).toBe('user')
    })

    it('should include summary when snapshot exists', async () => {
      const sessionId = await sessionStore.createSession({ title: 'Test Session' })
      const msg1 = await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 1' }]
      })
      await sessionStore.addMessage({
        sessionId,
        role: 'user',
        parts: [{ kind: 'text', content: 'Message 2' }]
      })

      await sessionStore.createSnapshot({
        sessionId,
        kind: 'summary',
        content: 'Summary of conversation',
        messageCutoffId: msg1,
        tokenCount: 20
      })

      const context = await service.buildContextForAI(sessionId)

      expect(context.length).toBe(2) // Summary + message2
      expect(context[0].role).toBe('system') // Summary as system message
      expect(context[1].role).toBe('user') // Message 2
    })
  })

  describe('dispose', () => {
    it('should clean up resources', () => {
      expect(() => service.dispose()).not.toThrow()
    })
  })
})
