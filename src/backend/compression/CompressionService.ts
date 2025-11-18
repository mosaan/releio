import { TokenCounter } from './TokenCounter'
import { SummarizationService } from './SummarizationService'
import { ChatSessionStore } from '@backend/session/ChatSessionStore'
import { ModelConfigService } from './ModelConfigService'
import { getSetting } from '@backend/settings'
import logger from '@backend/logger'
import type { ChatMessageWithParts } from '@common/chat-types'
import type { CompressionSettings } from '@common/types'

const log = logger.child('compression:service')

export interface CompressionOptions {
  sessionId: string
  provider: string
  model: string
  apiKey: string
  baseURL?: string
  retentionTokenCount?: number
  force?: boolean
}

export interface CompressionResult {
  compressed: boolean
  summaryId?: string
  originalTokenCount: number
  newTokenCount: number
  messagesCompressed: number
  messageCutoffId?: string
  summary?: string
  compressionRatio?: number
}

export interface ContextCheckResult {
  needsCompression: boolean
  currentTokenCount: number
  contextLimit: number
  thresholdTokenCount: number
  utilizationPercentage: number
  retentionTokenBudget: number
  retainedMessageCount: number
  compressibleMessageCount: number
  estimatedResponseTokens: number
}

/**
 * Core compression service that orchestrates the compression workflow
 * Integrates TokenCounter, SummarizationService, ChatSessionStore, and ModelConfigService
 */
export class CompressionService {
  constructor(
    private tokenCounter: TokenCounter,
    private summarizationService: SummarizationService,
    private sessionStore: ChatSessionStore,
    private modelConfigService: ModelConfigService
  ) {}

  /**
   * Get compression settings for a session, with fallback to global defaults
   */
  private async getCompressionSettings(sessionId: string): Promise<CompressionSettings> {
    // Try per-session settings first
    const settingsKey = `compression:${sessionId}`
    const sessionSettings = await getSetting<CompressionSettings>(settingsKey)

    if (sessionSettings) {
      return sessionSettings
    }

    // Fall back to global defaults
    const globalKey = 'compression:global-defaults'
    const globalSettings = await getSetting<CompressionSettings>(globalKey)

    if (globalSettings) {
      return globalSettings
    }

    // Final fallback: hard-coded defaults
    return {
      threshold: 0.95,
      retentionTokens: 2000,
      autoCompress: true
    }
  }

  /**
   * Check if conversation context needs compression
   * Returns detailed analysis of current token usage
   */
  async checkContext(
    sessionId: string,
    provider: string,
    model: string,
    additionalInput?: string
  ): Promise<ContextCheckResult> {
    log.info('Checking context', { sessionId, provider, model })

    // Get model configuration
    const config = await this.modelConfigService.getConfig(provider, model)

    // Get user compression settings
    const userSettings = await this.getCompressionSettings(sessionId)

    // Get session messages
    const session = await this.sessionStore.getSession(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // Build current context (may include existing summary)
    const contextMessages = await this.sessionStore.buildAIContext(sessionId)

    // Count tokens in current context
    const tokenResult = this.tokenCounter.countConversationTokens(contextMessages)
    let currentTokenCount = tokenResult.totalTokens

    // Add additional input if provided
    if (additionalInput) {
      currentTokenCount += this.tokenCounter.countText(additionalInput)
    }

    // Calculate thresholds using user settings
    const contextLimit = config.maxInputTokens
    const thresholdTokenCount = Math.floor(contextLimit * userSettings.threshold)
    const utilizationPercentage = (currentTokenCount / contextLimit) * 100

    // Determine if compression is needed
    const needsCompression = currentTokenCount > thresholdTokenCount

    // Calculate retention budget using user settings
    const retentionTokenBudget = userSettings.retentionTokens

    // Count how many messages would be retained vs compressed
    let retainedTokens = 0
    let retainedMessageCount = 0
    const messages = session.messages

    // Count from the end (most recent messages)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = this.tokenCounter.countMessageTokens(messages[i])
      if (retainedTokens + msgTokens <= retentionTokenBudget) {
        retainedTokens += msgTokens
        retainedMessageCount++
      } else {
        break
      }
    }

    const compressibleMessageCount = Math.max(0, messages.length - retainedMessageCount)

    log.info('Context check completed', {
      sessionId,
      currentTokenCount,
      contextLimit,
      utilizationPercentage: utilizationPercentage.toFixed(2),
      needsCompression,
      retainedMessageCount,
      compressibleMessageCount
    })

    return {
      needsCompression,
      currentTokenCount,
      contextLimit,
      thresholdTokenCount,
      utilizationPercentage,
      retentionTokenBudget,
      retainedMessageCount,
      compressibleMessageCount,
      estimatedResponseTokens: tokenResult.estimatedResponseTokens
    }
  }

  /**
   * Automatically compress conversation when threshold is exceeded
   * Respects compression threshold unless force=true
   */
  async autoCompress(options: CompressionOptions): Promise<CompressionResult> {
    const { sessionId, provider, model, apiKey, baseURL, retentionTokenCount, force } = options

    log.info('Starting auto-compression', { sessionId, provider, model, force })

    // Get model configuration
    await this.modelConfigService.getConfig(provider, model)

    // Get user compression settings
    const userSettings = await this.getCompressionSettings(sessionId)

    // Get session messages
    const session = await this.sessionStore.getSession(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const messages = session.messages
    if (messages.length === 0) {
      log.info('No messages to compress', { sessionId })
      return {
        compressed: false,
        originalTokenCount: 0,
        newTokenCount: 0,
        messagesCompressed: 0
      }
    }

    // Check if compression is needed (unless forced)
    if (!force) {
      const contextCheck = await this.checkContext(sessionId, provider, model)
      if (!contextCheck.needsCompression) {
        log.info('Compression not needed', {
          sessionId,
          currentTokenCount: contextCheck.currentTokenCount,
          threshold: contextCheck.thresholdTokenCount
        })
        return {
          compressed: false,
          originalTokenCount: contextCheck.currentTokenCount,
          newTokenCount: contextCheck.currentTokenCount,
          messagesCompressed: 0
        }
      }
    }

    // Determine retention boundary using user settings (allow override via parameter)
    const retentionBudget = retentionTokenCount ?? userSettings.retentionTokens

    // Calculate which messages to retain (from the end)
    let retainedTokens = 0
    let retentionIndex = messages.length

    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = this.tokenCounter.countMessageTokens(messages[i])
      if (retainedTokens + msgTokens <= retentionBudget) {
        retainedTokens += msgTokens
        retentionIndex = i
      } else {
        break
      }
    }

    // Messages to compress (before retention index)
    const messagesToCompress = messages.slice(0, retentionIndex)

    if (messagesToCompress.length === 0) {
      log.info('All messages within retention budget', { sessionId })
      const totalTokens = this.tokenCounter.countConversationTokens(messages).totalTokens
      return {
        compressed: false,
        originalTokenCount: totalTokens,
        newTokenCount: totalTokens,
        messagesCompressed: 0
      }
    }

    // Check if there's an existing summary to include
    const existingSummary = await this.sessionStore.getLatestSnapshot(sessionId, 'summary')
    let summaryPrefix = ''
    if (existingSummary) {
      summaryPrefix =
        '## Previous Summary\n\n' +
        (typeof existingSummary.content === 'string'
          ? existingSummary.content
          : JSON.stringify(existingSummary.content)) +
        '\n\n## Continuation\n\n'
    }

    // Generate summary
    log.info('Generating summary', {
      sessionId,
      messagesToCompress: messagesToCompress.length,
      hasExistingSummary: !!existingSummary
    })

    const summary = await this.summarizationService.summarize({
      messages: messagesToCompress,
      provider,
      model: options.model, // Allow model override
      apiKey,
      baseURL,
      sessionId,
      promptTemplate: existingSummary
        ? `You are summarizing a conversation. A previous summary exists. Please create a comprehensive summary that includes both the previous context and the new messages.\n\n${summaryPrefix}\n\nNow summarize the following new messages:`
        : undefined
    })

    // Count summary tokens
    const summaryTokens = this.tokenCounter.countText(summary)

    // Create snapshot
    const cutoffMessage = messagesToCompress[messagesToCompress.length - 1]
    const summaryId = await this.sessionStore.createSnapshot({
      sessionId,
      kind: 'summary',
      content: summary,
      messageCutoffId: cutoffMessage.id,
      tokenCount: summaryTokens
    })

    // Calculate compression results
    const originalTokens = this.tokenCounter.countConversationTokens(messages).totalTokens
    const retainedMessagesTokens =
      this.tokenCounter.countConversationTokens(messages.slice(retentionIndex)).totalTokens
    const newTokenCount = summaryTokens + retainedMessagesTokens

    const compressionRatio = ((originalTokens - newTokenCount) / originalTokens) * 100

    log.info('Compression completed', {
      sessionId,
      summaryId,
      originalTokens,
      newTokenCount,
      compressionRatio: compressionRatio.toFixed(2) + '%',
      messagesCompressed: messagesToCompress.length
    })

    return {
      compressed: true,
      summaryId,
      originalTokenCount: originalTokens,
      newTokenCount,
      messagesCompressed: messagesToCompress.length,
      messageCutoffId: cutoffMessage.id,
      summary,
      compressionRatio
    }
  }

  /**
   * Manually compress conversation regardless of threshold
   * Same as autoCompress with force=true
   */
  async manualCompress(options: CompressionOptions): Promise<CompressionResult> {
    return this.autoCompress({ ...options, force: true })
  }

  /**
   * Build AI context with compression applied
   * Returns messages ready to send to AI model
   */
  async buildContextForAI(sessionId: string): Promise<ChatMessageWithParts[]> {
    return this.sessionStore.buildAIContext(sessionId)
  }

  /**
   * Get detailed token usage breakdown for a session
   */
  async getTokenBreakdown(
    sessionId: string,
    mcpTools?: Record<string, any>
  ): Promise<{
    systemTokens: number
    summaryTokens: number
    regularMessageTokens: number
    toolTokens: number
  }> {
    // Get AI context (includes summary if exists)
    const contextMessages = await this.sessionStore.buildAIContext(sessionId)

    let systemTokens = 0
    let summaryTokens = 0
    let regularMessageTokens = 0

    for (const msg of contextMessages) {
      if (msg.role === 'system') {
        const tokens = this.tokenCounter.countMessageTokens(msg)
        // System messages from compression are identified by their ID pattern
        if (msg.id.startsWith('summary-')) {
          summaryTokens += tokens
        } else {
          systemTokens += tokens
        }
      } else {
        regularMessageTokens += this.tokenCounter.countMessageTokens(msg)
      }
    }

    // Calculate tool definition tokens if MCP tools are provided
    let toolTokens = 0
    if (mcpTools && Object.keys(mcpTools).length > 0) {
      // Convert tool definitions to JSON string and count tokens
      // This approximates how AI providers count tool definition tokens
      const toolsJson = JSON.stringify(mcpTools)
      toolTokens = this.tokenCounter.countText(toolsJson)
    }

    return {
      systemTokens,
      summaryTokens,
      regularMessageTokens,
      toolTokens
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.tokenCounter.dispose()
  }
}
