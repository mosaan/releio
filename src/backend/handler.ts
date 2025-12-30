import { Connection } from '@common/connection'
import type {
  Result,
  AISettingsV2,
  AIMessage,
  AppEvent,
  MCPServerConfig,
  MCPResource,
  MCPTool,
  MCPPrompt,
  ProxySettings,
  CertificateSettings,
  ConnectionTestResult,
  MCPServerWithStatus,
  AIProviderConfiguration,
  AIModelDefinition,
  CompressionSettings,
  TokenUsageInfo,
  CompressionPreview,
  CompressionResult as CommonCompressionResult,
  CompressionSummary,
  MastraStatus
} from '@common/types'
import { ok, error, isOk } from '@common/result'
import { dirname } from 'path'
import { getSetting, setSetting, getAllSettings, clearSetting } from './settings'
import { getDatabasePath, getLogPath } from './paths'
import logger from './logger'
import { mcpManager } from './mcp'
import {
  getProxySettings as loadProxySettings,
  setProxySettings as saveProxySettings,
  getSystemProxySettings as loadSystemProxySettings
} from './settings/proxy'
import {
  getCertificateSettings as loadCertificateSettings,
  setCertificateSettings as saveCertificateSettings,
  getSystemCertificateSettings as loadSystemCertificateSettings
} from './settings/certificate'
import {
  testProxyConnection as runProxyTest,
  testCertificateConnection as runCertificateTest,
  testCombinedConnection as runCombinedTest
} from './settings/connectionTest'
import {
  getAISettingsV2 as loadAISettingsV2,
  saveAISettingsV2,
  getProviderConfigurations as loadProviderConfigurations,
  getProviderConfiguration as loadProviderConfiguration,
  createProviderConfiguration as newProviderConfiguration,
  updateProviderConfiguration as modifyProviderConfiguration,
  deleteProviderConfiguration as removeProviderConfiguration,
  addModelToConfiguration,
  updateModelInConfiguration,
  deleteModelFromConfiguration,
  refreshModelsFromAPI
} from './settings/ai-settings'
import { ChatSessionStore } from './session/ChatSessionStore'
import type {
  CreateSessionRequest,
  AddMessageRequest,
  RecordToolInvocationResultRequest,
  ListSessionsOptions,
  SessionUpdates,
  ChatSessionRow,
  ChatSessionWithMessages
} from '@common/chat-types'
import { db } from './db'
import { CompressionService } from './compression/CompressionService'
import { TokenCounter } from './compression/TokenCounter'
import { SummarizationService } from './compression/SummarizationService'
import { ModelConfigService } from './compression/ModelConfigService'
import { mastraChatService } from './mastra/MastraChatService'
import { approvalManager } from './mastra/ApprovalManager'
import {
  toolPermissionService,
  type CreateToolPermissionRuleInput,
  type UpdateToolPermissionRuleInput
} from './mastra/ToolPermissionService'
import type { ToolPermissionRule } from '@common/types'

export class Handler {
  private _rendererConnection: Connection
  private _sessionStore: ChatSessionStore
  private _compressionService: CompressionService

  constructor({ rendererConnetion }: { rendererConnetion: Connection }) {
    this._rendererConnection = rendererConnetion
    this._sessionStore = new ChatSessionStore(db)

    // Initialize compression service dependencies
    const tokenCounter = new TokenCounter()
    const summarizationService = new SummarizationService()
    const modelConfigService = new ModelConfigService(db)
    this._compressionService = new CompressionService(
      tokenCounter,
      summarizationService,
      this._sessionStore,
      modelConfigService
    )
  }

  async ping(): Promise<Result<string>> {
    return ok('pong')
  }

  // Database handlers
  async getSetting(key: string): Promise<Result<unknown>> {
    const result = await getSetting(key)
    return ok(result)
  }

  async setSetting(key: string, value: unknown): Promise<Result<void>> {
    await setSetting(key, value)
    return ok(undefined)
  }

  async getAllSettings(): Promise<Result<unknown>> {
    const result = await getAllSettings()
    return ok(result)
  }

  async clearSetting(key: string): Promise<Result<void>> {
    await clearSetting(key)
    return ok(undefined)
  }

  async getDatabasePath(): Promise<Result<string>> {
    const dbPath = getDatabasePath()
    return ok(dirname(dbPath))
  }

  async getLogPath(): Promise<Result<string, string>> {
    const logPath = getLogPath()
    return ok(logPath)
  }

  // Mastra handlers
  async getMastraStatus(): Promise<Result<MastraStatus>> {
    const status = await mastraChatService.getStatus()
    return ok(status)
  }

  /**
   * Ensure all active Mastra sessions use DB session IDs
   * Call this during application startup
   */
  async cleanupMastraSessions(): Promise<Result<void, string>> {
    try {
      mastraChatService.invalidateAgent()
      logger.info('[Mastra] Cleaned up all in-memory sessions on startup')
      return ok(undefined)
    } catch (err) {
      logger.error('[Mastra] Failed to cleanup sessions', err)
      return error(err instanceof Error ? err.message : 'Cleanup failed')
    }
  }

  async startMastraSession(
    sessionId: string,
    resourceId?: string
  ): Promise<Result<{ sessionId: string; threadId: string; resourceId?: string }, string>> {
    try {
      if (!sessionId) {
        return error<string>('Session ID is required - create database session first')
      }

      // Verify session exists in database
      const dbSession = await this._sessionStore.getSession(sessionId)
      if (!dbSession) {
        return error<string>(`Database session ${sessionId} not found`)
      }

      const session = await mastraChatService.startSession(sessionId, resourceId)
      return ok({
        sessionId: session.sessionId,
        threadId: session.threadId,
        resourceId: session.resourceId
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start Mastra session'
      logger.error('[Mastra] startSession failed', { error: message })
      return error<string>(message)
    }
  }

  async streamMastraText(
    sessionId: string,
    messages: AIMessage[]
  ): Promise<Result<string, string>> {
    try {
      // CRITICAL: Validate session exists in database
      const dbSession = await this._sessionStore.getSession(sessionId)
      if (!dbSession) {
        const errorMsg = `Cannot stream: Database session ${sessionId} not found`
        logger.error('[Mastra]', errorMsg)
        return error<string>(errorMsg)
      }

      // CRITICAL: Validate session exists in Mastra
      const mastraSession = mastraChatService.getSession(sessionId)
      if (!mastraSession) {
        logger.warn('[Mastra] Session not found in Mastra, initializing...', { sessionId })
        // Auto-recover by creating Mastra session
        await mastraChatService.startSession(sessionId)
      }

      const streamId = await mastraChatService.streamText(
        sessionId,
        messages,
        (channel: string, event: AppEvent) => {
          this._rendererConnection.publishEvent(channel, event)
        },
        async (parts) => {
          logger.info('[Mastra] Saving assistant message to DB', {
            sessionId,
            partsCount: parts.length
          })

          try {
            await this._sessionStore.addMessage({
              sessionId,
              role: 'assistant',
              parts: parts as any // Cast to match AddMessageRequest parts type
            })
            logger.info('[Mastra] Assistant message saved successfully')
          } catch (err) {
            logger.error('[Mastra] Failed to save assistant message', err)
          }
        }
      )
      return ok(streamId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start Mastra stream'
      logger.error('[Mastra] streamText failed', { error: message })
      return error<string>(message)
    }
  }

  async abortMastraStream(streamId: string): Promise<Result<void, string>> {
    const aborted = mastraChatService.abortStream(streamId)
    if (!aborted) {
      return error<string>('Stream not found')
    }
    return ok(undefined)
  }

  // AI Settings v2 handlers
  async getAISettingsV2(): Promise<Result<AISettingsV2>> {
    const settings = await loadAISettingsV2()
    return ok(settings)
  }

  async saveAISettingsV2(settings: AISettingsV2): Promise<Result<void>> {
    await saveAISettingsV2(settings)
    return ok(undefined)
  }

  // Proxy settings handlers
  async getProxySettings(): Promise<Result<ProxySettings>> {
    const settings = await loadProxySettings()
    return ok(settings)
  }

  async setProxySettings(settings: ProxySettings): Promise<Result<void>> {
    await saveProxySettings(settings)
    return ok(undefined)
  }

  async getSystemProxySettings(): Promise<Result<ProxySettings>> {
    const settings = await loadSystemProxySettings()
    return ok(settings)
  }

  // Certificate settings handlers
  async getCertificateSettings(): Promise<Result<CertificateSettings>> {
    const settings = await loadCertificateSettings()
    return ok(settings)
  }

  async setCertificateSettings(settings: CertificateSettings): Promise<Result<void>> {
    await saveCertificateSettings(settings)
    return ok(undefined)
  }

  async getSystemCertificateSettings(): Promise<Result<CertificateSettings>> {
    const settings = await loadSystemCertificateSettings()
    return ok(settings)
  }

  // Connection test handlers
  async testProxyConnection(settings: ProxySettings): Promise<Result<ConnectionTestResult>> {
    const result = await runProxyTest(settings)
    return ok(result)
  }

  async testCertificateConnection(
    settings: CertificateSettings
  ): Promise<Result<ConnectionTestResult>> {
    const result = await runCertificateTest(settings)
    return ok(result)
  }

  async testCombinedConnection(
    proxySettings: ProxySettings,
    certSettings: CertificateSettings
  ): Promise<Result<ConnectionTestResult>> {
    const result = await runCombinedTest(proxySettings, certSettings)
    return ok(result)
  }

  async testFullConnection(): Promise<Result<ConnectionTestResult, string>> {
    // Get current proxy and certificate settings
    const proxyResult = await this.getProxySettings()
    const certResult = await this.getCertificateSettings()

    if (!isOk(proxyResult) || !isOk(certResult)) {
      return error('Failed to load current settings')
    }

    const result = await runCombinedTest(proxyResult.value, certResult.value)
    return ok(result)
  }

  // MCP Server Management
  async listMCPServers(): Promise<Result<MCPServerWithStatus[], string>> {
    return await mcpManager.listServers()
  }

  async addMCPServer(
    config: Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Result<string, string>> {
    return await mcpManager.addServer(config)
  }

  async updateMCPServer(
    serverId: string,
    updates: Partial<MCPServerConfig>
  ): Promise<Result<void, string>> {
    return await mcpManager.updateServer(serverId, updates)
  }

  async removeMCPServer(serverId: string): Promise<Result<void, string>> {
    return await mcpManager.removeServer(serverId)
  }

  async getMCPResources(serverId: string): Promise<Result<MCPResource[], string>> {
    return await mcpManager.listResources(serverId)
  }

  async getMCPTools(serverId: string): Promise<Result<MCPTool[], string>> {
    return await mcpManager.listTools(serverId)
  }

  async getMCPPrompts(serverId: string): Promise<Result<MCPPrompt[], string>> {
    return await mcpManager.listPrompts(serverId)
  }

  async callMCPTool(
    serverId: string,
    toolName: string,
    args: unknown
  ): Promise<Result<unknown, string>> {
    return await mcpManager.callTool(serverId, toolName, args)
  }

  // Provider Configuration Handlers
  async getProviderConfigurations(): Promise<Result<AIProviderConfiguration[]>> {
    const configs = await loadProviderConfigurations()
    return ok(configs)
  }

  async getProviderConfiguration(
    configId: string
  ): Promise<Result<AIProviderConfiguration | undefined>> {
    const config = await loadProviderConfiguration(configId)
    return ok(config)
  }

  async createProviderConfiguration(
    config: Omit<AIProviderConfiguration, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Result<string>> {
    const configId = await newProviderConfiguration(config)
    return ok(configId)
  }

  async updateProviderConfiguration(
    configId: string,
    updates: Partial<Omit<AIProviderConfiguration, 'id' | 'createdAt'>>
  ): Promise<Result<void>> {
    await modifyProviderConfiguration(configId, updates)
    return ok(undefined)
  }

  async deleteProviderConfiguration(configId: string): Promise<Result<void>> {
    await removeProviderConfiguration(configId)
    return ok(undefined)
  }

  async addModelToConfiguration(
    configId: string,
    model: Omit<AIModelDefinition, 'source' | 'addedAt'>
  ): Promise<Result<void>> {
    await addModelToConfiguration(configId, model)
    return ok(undefined)
  }

  async updateModelInConfiguration(
    configId: string,
    modelId: string,
    updates: Partial<Omit<AIModelDefinition, 'id' | 'source' | 'addedAt'>>
  ): Promise<Result<void>> {
    await updateModelInConfiguration(configId, modelId, updates)
    return ok(undefined)
  }

  async deleteModelFromConfiguration(configId: string, modelId: string): Promise<Result<void>> {
    await deleteModelFromConfiguration(configId, modelId)
    return ok(undefined)
  }

  async refreshModelsFromAPI(configId: string): Promise<Result<AIModelDefinition[]>> {
    const models = await refreshModelsFromAPI(configId)
    return ok(models)
  }

  // Chat Session Management handlers
  async createChatSession(request: CreateSessionRequest): Promise<Result<string>> {
    const sessionId = await this._sessionStore.createSession(request)
    return ok(sessionId)
  }

  async getChatSession(sessionId: string): Promise<Result<ChatSessionWithMessages | null>> {
    const session = await this._sessionStore.getSession(sessionId)
    if (!session) {
      return ok(null)
    }

    // Get compression summaries for this session
    const snapshots = await this._sessionStore.getSnapshots(sessionId)
    const summaries = snapshots
      .filter((s) => s.kind === 'summary')
      .map((s) => ({
        id: s.id,
        content: typeof s.content === 'string' ? s.content : JSON.stringify(s.content),
        messageCutoffId: s.messageCutoffId,
        tokenCount: s.tokenCount,
        createdAt: new Date(s.createdAt).toISOString()
      }))

    logger.info('[getChatSession] Compression summaries', {
      sessionId,
      summaryCount: summaries.length,
      messageCutoffIds: summaries.map((s) => s.messageCutoffId)
    })

    return ok({
      ...session,
      compressionSummaries: summaries
    })
  }

  async listChatSessions(options?: ListSessionsOptions): Promise<Result<ChatSessionRow[]>> {
    const sessions = await this._sessionStore.listSessions(options)
    return ok(sessions)
  }

  async updateChatSession(sessionId: string, updates: SessionUpdates): Promise<Result<void>> {
    await this._sessionStore.updateSession(sessionId, updates)
    return ok(undefined)
  }

  async deleteChatSession(sessionId: string): Promise<Result<void>> {
    await this._sessionStore.deleteSession(sessionId)
    return ok(undefined)
  }

  async searchChatSessions(query: string): Promise<Result<ChatSessionRow[]>> {
    const sessions = await this._sessionStore.searchSessions(query)
    return ok(sessions)
  }

  async addChatMessage(request: AddMessageRequest): Promise<Result<string>> {
    const messageId = await this._sessionStore.addMessage(request)
    return ok(messageId)
  }

  async recordToolInvocationResult(
    request: RecordToolInvocationResultRequest
  ): Promise<Result<void>> {
    await this._sessionStore.recordToolInvocationResult(request)
    return ok(undefined)
  }

  async deleteMessagesAfter(sessionId: string, messageId: string): Promise<Result<void>> {
    await this._sessionStore.deleteMessagesAfter(sessionId, messageId)
    return ok(undefined)
  }

  async getLastSessionId(): Promise<Result<string | null>> {
    const sessionId = await this._sessionStore.getLastSessionId()
    return ok(sessionId)
  }

  async setLastSessionId(sessionId: string): Promise<Result<void>> {
    await this._sessionStore.setLastSessionId(sessionId)
    return ok(undefined)
  }

  // Compression handlers

  async getCompressionSettings(sessionId: string): Promise<Result<CompressionSettings>> {
    // Try per-session settings first
    const settingsKey = `compression:${sessionId}`
    const sessionSettings = await getSetting<CompressionSettings>(settingsKey)

    if (sessionSettings) {
      return ok(sessionSettings)
    }

    // Fall back to global defaults
    const globalKey = 'compression:global-defaults'
    const globalSettings = await getSetting<CompressionSettings>(globalKey)

    if (globalSettings) {
      return ok(globalSettings)
    }

    // Final fallback: hard-coded defaults
    const defaults: CompressionSettings = {
      threshold: 0.95, // 95% of context window
      retentionTokens: 2000, // Default retention tokens
      autoCompress: true
    }
    return ok(defaults)
  }

  async setCompressionSettings(
    sessionId: string,
    settings: CompressionSettings
  ): Promise<Result<void, string>> {
    // Validate settings
    if (settings.threshold < 0.7 || settings.threshold > 1.0) {
      return error('Threshold must be between 0.70 and 1.00')
    }
    if (settings.retentionTokens < 0) {
      return error('Retention tokens must be positive')
    }

    // Store per-session settings
    const settingsKey = `compression:${sessionId}`
    await setSetting(settingsKey, settings)
    return ok(undefined)
  }

  async getTokenUsage(
    sessionId: string,
    provider: string,
    model: string,
    additionalInput?: string
  ): Promise<Result<TokenUsageInfo, string>> {
    try {
      const contextCheck = await this._compressionService.checkContext(
        sessionId,
        provider,
        model,
        additionalInput
      )

      // Get MCP tools for token calculation
      const mcpTools = await mcpManager.getAllTools()

      // Get detailed token breakdown
      const breakdown = await this._compressionService.getTokenBreakdown(sessionId, mcpTools)

      // Calculate total tokens including tool definitions
      const totalTokens = contextCheck.currentTokenCount + breakdown.toolTokens

      const tokenUsage: TokenUsageInfo = {
        currentTokens: totalTokens,
        maxTokens: contextCheck.contextLimit,
        inputTokens: totalTokens,
        outputTokens: 0, // Not tracked separately in context check
        estimatedResponseTokens: contextCheck.estimatedResponseTokens,
        utilizationPercentage: (totalTokens / contextCheck.contextLimit) * 100,
        thresholdPercentage: (contextCheck.thresholdTokenCount / contextCheck.contextLimit) * 100,
        needsCompression: totalTokens > contextCheck.thresholdTokenCount,
        breakdown: {
          systemTokens: breakdown.systemTokens,
          summaryTokens: breakdown.summaryTokens,
          regularMessageTokens: breakdown.regularMessageTokens,
          toolTokens: breakdown.toolTokens,
          currentInputTokens: additionalInput
            ? this._compressionService['tokenCounter'].countText(additionalInput)
            : 0
        }
      }

      return ok(tokenUsage)
    } catch (err) {
      logger.error('Failed to get token usage', { sessionId, error: err })
      return error(err instanceof Error ? err.message : 'Failed to get token usage')
    }
  }

  async checkCompressionNeeded(
    sessionId: string,
    provider: string,
    model: string
  ): Promise<Result<boolean, string>> {
    try {
      const contextCheck = await this._compressionService.checkContext(sessionId, provider, model)
      return ok(contextCheck.needsCompression)
    } catch (err) {
      logger.error('Failed to check compression needed', { sessionId, error: err })
      return error(err instanceof Error ? err.message : 'Failed to check compression')
    }
  }

  async getCompressionPreview(
    sessionId: string,
    provider: string,
    model: string,
    _retentionTokens?: number
  ): Promise<Result<CompressionPreview, string>> {
    try {
      const contextCheck = await this._compressionService.checkContext(sessionId, provider, model)

      // Calculate expected new token count
      // This is approximate: summary tokens + retained message tokens
      const estimatedSummaryTokens = Math.min(500, contextCheck.compressibleMessageCount * 10) // Rough estimate
      const expectedNewTokens =
        estimatedSummaryTokens +
        (contextCheck.currentTokenCount -
          contextCheck.currentTokenCount *
            (contextCheck.compressibleMessageCount /
              (contextCheck.compressibleMessageCount + contextCheck.retainedMessageCount)))

      const tokenSavings = contextCheck.currentTokenCount - expectedNewTokens
      const savingsPercentage = (tokenSavings / contextCheck.currentTokenCount) * 100

      const preview: CompressionPreview = {
        messagesToCompress: contextCheck.compressibleMessageCount,
        currentTokens: contextCheck.currentTokenCount,
        expectedNewTokens: Math.floor(expectedNewTokens),
        tokenSavings: Math.floor(tokenSavings),
        savingsPercentage,
        canCompress: contextCheck.compressibleMessageCount > 0,
        reason: contextCheck.compressibleMessageCount === 0 ? 'No messages to compress' : undefined
      }

      return ok(preview)
    } catch (err) {
      logger.error('Failed to get compression preview', { sessionId, error: err })
      return error(err instanceof Error ? err.message : 'Failed to get compression preview')
    }
  }

  async compressConversation(
    sessionId: string,
    provider: string,
    model: string,
    apiKey: string,
    force?: boolean,
    retentionTokenCount?: number
  ): Promise<Result<CommonCompressionResult, string>> {
    try {
      logger.info('Compressing conversation', { sessionId, provider, model, force })

      const result = await this._compressionService.autoCompress({
        sessionId,
        provider,
        model,
        apiKey,
        force,
        retentionTokenCount
      })

      // Map internal CompressionResult to common CompressionResult type
      const commonResult: CommonCompressionResult = {
        compressed: result.compressed,
        summaryId: result.summaryId,
        messagesCompressed: result.messagesCompressed,
        originalTokenCount: result.originalTokenCount,
        newTokenCount: result.newTokenCount,
        compressionRatio: result.compressionRatio,
        reason: result.compressed ? undefined : 'Compression not needed'
      }

      return ok(commonResult)
    } catch (err) {
      logger.error('Failed to compress conversation', { sessionId, error: err })
      return error(err instanceof Error ? err.message : 'Failed to compress conversation')
    }
  }

  async getCompressionSummaries(sessionId: string): Promise<Result<CompressionSummary[], string>> {
    try {
      const snapshots = await this._sessionStore.getSnapshots(sessionId)

      // Filter for summary snapshots and map to CompressionSummary type
      const summaries: CompressionSummary[] = snapshots
        .filter((s) => s.kind === 'summary')
        .map((s) => ({
          id: s.id,
          content: typeof s.content === 'string' ? s.content : JSON.stringify(s.content),
          messageCutoffId: s.messageCutoffId,
          tokenCount: s.tokenCount,
          createdAt: s.createdAt
        }))

      return ok(summaries)
    } catch (err) {
      logger.error('Failed to get compression summaries', { sessionId, error: err })
      return error(err instanceof Error ? err.message : 'Failed to get compression summaries')
    }
  }

  // Tool Permission Management handlers

  async listToolPermissionRules(): Promise<Result<ToolPermissionRule[], string>> {
    try {
      const rules = await toolPermissionService.listRules()
      return ok(rules)
    } catch (err) {
      logger.error('Failed to list tool permission rules', { error: err })
      return error(err instanceof Error ? err.message : 'Failed to list rules')
    }
  }

  async getToolPermissionRule(id: string): Promise<Result<ToolPermissionRule | null, string>> {
    try {
      const rule = await toolPermissionService.getRule(id)
      return ok(rule)
    } catch (err) {
      logger.error('Failed to get tool permission rule', { id, error: err })
      return error(err instanceof Error ? err.message : 'Failed to get rule')
    }
  }

  async createToolPermissionRule(
    input: CreateToolPermissionRuleInput
  ): Promise<Result<ToolPermissionRule, string>> {
    try {
      const rule = await toolPermissionService.createRule(input)
      // Invalidate Mastra agent to reload tools with updated permissions
      mastraChatService.invalidateAgent()
      return ok(rule)
    } catch (err) {
      logger.error('Failed to create tool permission rule', { input, error: err })
      return error(err instanceof Error ? err.message : 'Failed to create rule')
    }
  }

  async updateToolPermissionRule(
    id: string,
    input: UpdateToolPermissionRuleInput
  ): Promise<Result<ToolPermissionRule | null, string>> {
    try {
      const rule = await toolPermissionService.updateRule(id, input)
      // Invalidate Mastra agent to reload tools with updated permissions
      mastraChatService.invalidateAgent()
      return ok(rule)
    } catch (err) {
      logger.error('Failed to update tool permission rule', { id, input, error: err })
      return error(err instanceof Error ? err.message : 'Failed to update rule')
    }
  }

  async deleteToolPermissionRule(id: string): Promise<Result<boolean, string>> {
    try {
      const deleted = await toolPermissionService.deleteRule(id)
      // Invalidate Mastra agent to reload tools with updated permissions
      mastraChatService.invalidateAgent()
      return ok(deleted)
    } catch (err) {
      logger.error('Failed to delete tool permission rule', { id, error: err })
      return error(err instanceof Error ? err.message : 'Failed to delete rule')
    }
  }

  // HITL Tool Approval handlers

  async approveToolCall(runId: string, toolCallId?: string): Promise<Result<void, string>> {
    try {
      const success = approvalManager.approve(runId)
      if (success) {
        logger.info('[HITL] Tool call approved', { runId, toolCallId })
        return ok(undefined)
      } else {
        logger.warn('[HITL] Approval request not found or timed out', { runId })
        return error('Approval request not found or timed out')
      }
    } catch (err) {
      logger.error('[HITL] Failed to approve tool call', { runId, toolCallId, error: err })
      return error(err instanceof Error ? err.message : 'Failed to approve tool call')
    }
  }

  async declineToolCall(
    runId: string,
    toolCallId?: string,
    reason?: string
  ): Promise<Result<void, string>> {
    try {
      const success = approvalManager.decline(runId, reason)
      if (success) {
        logger.info('[HITL] Tool call declined', { runId, toolCallId, reason })
        return ok(undefined)
      } else {
        logger.warn('[HITL] Approval request not found or timed out', { runId })
        return error('Approval request not found or timed out')
      }
    } catch (err) {
      logger.error('[HITL] Failed to decline tool call', { runId, toolCallId, error: err })
      return error(err instanceof Error ? err.message : 'Failed to decline tool call')
    }
  }

  /**
   * tRPC リクエストを処理
   */
  async invokeTRPC(request: {
    path: string
    input: unknown
    type: string
  }): Promise<Result<unknown, string>> {
    try {
      const { path, input } = request

      logger.info('tRPC request via Connection', { path, input })

      // tRPC router から caller を作成
      const { backendRouter } = await import('./trpc/router')
      const caller = backendRouter.createCaller({})

      // Path を使って procedure を呼び出す
      // 例: "ping" -> caller.ping()
      const pathParts = path.split('.')
      let procedure: any = caller

      for (const part of pathParts) {
        procedure = procedure[part]
        if (!procedure) {
          logger.error('tRPC procedure not found', { path })
          return error(`Procedure ${path} not found`)
        }
      }

      // Procedure を実行（query または mutation）
      const result = await procedure(input)

      logger.info('tRPC request successful', { path })
      return ok(result)
    } catch (err) {
      logger.error('tRPC request failed', { error: err })
      return error(err instanceof Error ? err.message : 'tRPC request failed')
    }
  }
}
