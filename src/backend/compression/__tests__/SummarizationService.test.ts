import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SummarizationService } from '../SummarizationService'
import type { ChatMessageWithParts } from '@common/chat-types'

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn()
}))

// Mock the AI factory
vi.mock('@backend/ai/factory', () => ({
  createModel: vi.fn()
}))

describe('SummarizationService', () => {
  let service: SummarizationService
  let mockGenerateText: any
  let mockCreateModel: any

  beforeEach(async () => {
    service = new SummarizationService()

    // Get mocked functions
    const { generateText } = await import('ai')
    const { createModel } = await import('@backend/ai/factory')
    mockGenerateText = generateText as any
    mockCreateModel = createModel as any

    // Reset mocks
    vi.clearAllMocks()
  })

  describe('summarize', () => {
    it('should generate a summary using OpenAI', async () => {
      const messages: ChatMessageWithParts[] = [
        {
          id: 'msg-1',
          sessionId: 'session-1',
          role: 'user',
          state: 'completed',
          sequence: 1,
          createdAt: new Date().toISOString(),
          parts: [
            {
              kind: 'text',
              id: 'part-1',
              content: 'What is the capital of France?',
              createdAt: new Date().toISOString()
            }
          ]
        },
        {
          id: 'msg-2',
          sessionId: 'session-1',
          role: 'assistant',
          state: 'completed',
          sequence: 2,
          createdAt: new Date().toISOString(),
          parts: [
            {
              kind: 'text',
              id: 'part-2',
              content: 'The capital of France is Paris.',
              createdAt: new Date().toISOString()
            }
          ]
        }
      ]

      // Mock the model creation
      mockCreateModel.mockResolvedValue({
        /* mock model */
      })

      // Mock the summary generation
      const mockSummary = '## Summary\n- User asked about the capital of France\n- Assistant answered: Paris'
      mockGenerateText.mockResolvedValue({
        text: mockSummary
      })

      const summary = await service.summarize({
        messages,
        provider: 'openai',
        apiKey: 'test-key',
        sessionId: 'session-1'
      })

      expect(summary).toBe(mockSummary)
      expect(mockCreateModel).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          model: 'gpt-4o-mini', // Should use summarization model
          apiKey: 'test-key'
        })
      )
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.3
        })
      )
    })

    it('should use Anthropic summarization model', async () => {
      const messages: ChatMessageWithParts[] = [
        {
          id: 'msg-1',
          sessionId: 'session-1',
          role: 'user',
          state: 'completed',
          sequence: 1,
          createdAt: new Date().toISOString(),
          parts: [
            {
              kind: 'text',
              id: 'part-1',
              content: 'Hello',
              createdAt: new Date().toISOString()
            }
          ]
        }
      ]

      mockCreateModel.mockResolvedValue({})
      mockGenerateText.mockResolvedValue({ text: '## Summary\nGreeting' })

      await service.summarize({
        messages,
        provider: 'anthropic',
        apiKey: 'test-key',
        sessionId: 'session-1'
      })

      expect(mockCreateModel).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'anthropic',
          model: 'claude-3-5-haiku-20241022' // Anthropic summarization model
        })
      )
    })

    it('should use Google summarization model', async () => {
      const messages: ChatMessageWithParts[] = [
        {
          id: 'msg-1',
          sessionId: 'session-1',
          role: 'user',
          state: 'completed',
          sequence: 1,
          createdAt: new Date().toISOString(),
          parts: [
            {
              kind: 'text',
              id: 'part-1',
              content: 'Test',
              createdAt: new Date().toISOString()
            }
          ]
        }
      ]

      mockCreateModel.mockResolvedValue({})
      mockGenerateText.mockResolvedValue({ text: '## Summary\nTest message' })

      await service.summarize({
        messages,
        provider: 'google',
        apiKey: 'test-key',
        sessionId: 'session-1'
      })

      expect(mockCreateModel).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google',
          model: 'gemini-2.5-flash' // Google summarization model
        })
      )
    })

    it('should allow model override', async () => {
      const messages: ChatMessageWithParts[] = [
        {
          id: 'msg-1',
          sessionId: 'session-1',
          role: 'user',
          state: 'completed',
          sequence: 1,
          createdAt: new Date().toISOString(),
          parts: [
            {
              kind: 'text',
              id: 'part-1',
              content: 'Test',
              createdAt: new Date().toISOString()
            }
          ]
        }
      ]

      mockCreateModel.mockResolvedValue({})
      mockGenerateText.mockResolvedValue({ text: '## Summary\nTest' })

      await service.summarize({
        messages,
        provider: 'openai',
        model: 'gpt-4o', // Override default
        apiKey: 'test-key',
        sessionId: 'session-1'
      })

      expect(mockCreateModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o' // Should use overridden model
        })
      )
    })

    it('should handle tool invocations in messages', async () => {
      const messages: ChatMessageWithParts[] = [
        {
          id: 'msg-1',
          sessionId: 'session-1',
          role: 'user',
          state: 'completed',
          sequence: 1,
          createdAt: new Date().toISOString(),
          parts: [
            {
              kind: 'text',
              id: 'part-1',
              content: 'Search for information',
              createdAt: new Date().toISOString()
            }
          ]
        },
        {
          id: 'msg-2',
          sessionId: 'session-1',
          role: 'assistant',
          state: 'completed',
          sequence: 2,
          createdAt: new Date().toISOString(),
          parts: [
            {
              kind: 'tool_invocation',
              id: 'part-2',
              toolCallId: 'call-1',
              toolName: 'web_search',
              input: { query: 'test query' },
              status: 'success',
              metadata: undefined
            }
          ]
        },
        {
          id: 'msg-3',
          sessionId: 'session-1',
          role: 'tool',
          state: 'completed',
          sequence: 3,
          createdAt: new Date().toISOString(),
          parts: [
            {
              kind: 'tool_result',
              id: 'part-3',
              relatedToolCallId: 'call-1',
              output: { results: ['Result 1'] },
              metadata: undefined
            }
          ]
        }
      ]

      mockCreateModel.mockResolvedValue({})
      mockGenerateText.mockResolvedValue({ text: '## Summary\nSearch performed' })

      const summary = await service.summarize({
        messages,
        provider: 'openai',
        apiKey: 'test-key',
        sessionId: 'session-1'
      })

      expect(summary).toBeDefined()
      // Verify that the prompt includes tool information
      const promptCall = mockGenerateText.mock.calls[0][0]
      expect(promptCall.prompt).toContain('tool_invocation')
      expect(promptCall.prompt).toContain('web_search')
      expect(promptCall.prompt).toContain('tool_result')
    })

    it('should handle custom prompt template', async () => {
      const messages: ChatMessageWithParts[] = [
        {
          id: 'msg-1',
          sessionId: 'session-1',
          role: 'user',
          state: 'completed',
          sequence: 1,
          createdAt: new Date().toISOString(),
          parts: [
            {
              kind: 'text',
              id: 'part-1',
              content: 'Test',
              createdAt: new Date().toISOString()
            }
          ]
        }
      ]

      const customPrompt = 'Custom summarization prompt: {conversation}'

      mockCreateModel.mockResolvedValue({})
      mockGenerateText.mockResolvedValue({ text: '## Summary\nCustom' })

      await service.summarize({
        messages,
        provider: 'openai',
        apiKey: 'test-key',
        sessionId: 'session-1',
        promptTemplate: customPrompt
      })

      const promptCall = mockGenerateText.mock.calls[0][0]
      expect(promptCall.prompt).toBe(customPrompt)
    })

    it('should throw error on summarization failure', async () => {
      const messages: ChatMessageWithParts[] = [
        {
          id: 'msg-1',
          sessionId: 'session-1',
          role: 'user',
          state: 'completed',
          sequence: 1,
          createdAt: new Date().toISOString(),
          parts: [
            {
              kind: 'text',
              id: 'part-1',
              content: 'Test',
              createdAt: new Date().toISOString()
            }
          ]
        }
      ]

      mockCreateModel.mockResolvedValue({})
      mockGenerateText.mockRejectedValue(new Error('API error'))

      await expect(
        service.summarize({
          messages,
          provider: 'openai',
          apiKey: 'test-key',
          sessionId: 'session-1'
        })
      ).rejects.toThrow('Failed to generate summary')
    })
  })

  describe('prompt generation', () => {
    it('should include summarization instructions in prompt', async () => {
      const messages: ChatMessageWithParts[] = [
        {
          id: 'msg-1',
          sessionId: 'session-1',
          role: 'user',
          state: 'completed',
          sequence: 1,
          createdAt: new Date().toISOString(),
          parts: [
            {
              kind: 'text',
              id: 'part-1',
              content: 'Test message',
              createdAt: new Date().toISOString()
            }
          ]
        }
      ]

      mockCreateModel.mockResolvedValue({})
      mockGenerateText.mockResolvedValue({ text: '## Summary\nTest' })

      await service.summarize({
        messages,
        provider: 'openai',
        apiKey: 'test-key',
        sessionId: 'session-1'
      })

      const promptCall = mockGenerateText.mock.calls[0][0]
      const prompt = promptCall.prompt

      // Check for key instructions
      expect(prompt).toContain('key facts')
      expect(prompt).toContain('chronological order')
      expect(prompt).toContain('technical details')
      expect(prompt).toContain('tool invocations')
      expect(prompt).toContain('concise language')
    })
  })
})
