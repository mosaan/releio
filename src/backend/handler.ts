import { Connection } from '@common/connection'
import type {
  Result,
  AIProvider,
  AIConfig,
  AISettings,
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
  StreamAIOptions,
  AIProviderConfig,
  AzureProviderConfig,
  AIProviderConfiguration,
  AIModelDefinition,
  CompressionSettings,
  TokenUsageInfo,
  CompressionPreview,
  CompressionResult as CommonCompressionResult,
  CompressionSummary
} from '@common/types'
import { ok, error, isOk } from '@common/result'
import { dirname } from 'path'
import { getSetting, setSetting, getAllSettings, clearSetting } from './settings'
import { getDatabasePath, getLogPath } from './paths'
import logger from './logger'
import { streamText, abortStream, listAvailableModel, testConnection } from './ai'
import { FACTORY } from './ai/factory'
import { mcpManager } from './mcp'
import { getProxySettings as loadProxySettings, setProxySettings as saveProxySettings, getSystemProxySettings as loadSystemProxySettings } from './settings/proxy'
import { getCertificateSettings as loadCertificateSettings, setCertificateSettings as saveCertificateSettings, getSystemCertificateSettings as loadSystemCertificateSettings } from './settings/certificate'
import { testProxyConnection as runProxyTest, testCertificateConnection as runCertificateTest, testCombinedConnection as runCombinedTest } from './settings/connectionTest'
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

  // AI handlers
  async streamAIText(messages: AIMessage[], options?: StreamAIOptions): Promise<Result<string>> {
    let selectedProvider: AIProvider
    let selectedModel: string
    let apiKey: string
    let providerConfig: AIProviderConfig | AzureProviderConfig | undefined

    // Resolution logic: modelSelection → explicit provider/model → V1 fallback

    if (options?.modelSelection) {
      // Use model selection from V2 settings
      const settings = await loadAISettingsV2()
      const { providerConfigId, modelId } = options.modelSelection

      // Find the provider configuration
      const config = settings.providerConfigs.find(c => c.id === providerConfigId)
      if (!config) {
        throw new Error(`Provider configuration not found: ${providerConfigId}`)
      }
      if (!config.enabled) {
        throw new Error(`Provider configuration is disabled: ${config.name}`)
      }

      // Find the model
      const model = config.models.find(m => m.id === modelId)
      if (!model) {
        throw new Error(`Model not found in configuration: ${modelId}`)
      }

      // Validate API key
      if (!config.config.apiKey) {
        throw new Error(`API key not configured for: ${config.name}`)
      }

      selectedProvider = config.type as AIProvider
      selectedModel = model.id
      apiKey = config.config.apiKey
      providerConfig = config.config

      logger.info(`Using model selection: ${config.name} (${providerConfigId}) - ${model.displayName || model.id}`)
    } else if (options?.provider) {
      // Use explicit provider/model override
      selectedProvider = options.provider
      selectedModel = options.model || FACTORY[selectedProvider].default

      logger.info(`Using explicit provider override: ${selectedProvider} - ${selectedModel}`)
    } else {
      // Fallback to v1 settings
      logger.warn('No model selection provided, falling back to v1 settings')
      const aiSettings = await getSetting<AISettings>('ai')
      if (!aiSettings?.default_provider) {
        throw new Error('No AI provider configured')
      }

      selectedProvider = aiSettings.default_provider
      const apiKeyField = `${selectedProvider}_api_key` as keyof AISettings
      apiKey = aiSettings[apiKeyField] as string

      if (!apiKey) {
        throw new Error(`API key not found for provider: ${selectedProvider}`)
      }

      const modelField = `${selectedProvider}_model` as keyof AISettings
      selectedModel = (aiSettings[modelField] as string) || FACTORY[selectedProvider].default
    }

    // Create config object
    const config: AIConfig = {
      provider: selectedProvider!,
      model: selectedModel!,
      apiKey: apiKey!,
      baseURL: providerConfig?.baseURL,
      // Azure-specific fields
      resourceName: (providerConfig as AzureProviderConfig)?.resourceName,
      useDeploymentBasedUrls: (providerConfig as AzureProviderConfig)?.useDeploymentBasedUrls
    }

    logger.info(`Streaming with ${config.provider} - ${config.model}`)

    // Get MCP tools from all active servers
    const mcpTools = await mcpManager.getAllTools()
    const toolCount = Object.keys(mcpTools).length
    logger.info(`Streaming AI text with ${toolCount} MCP tool(s) available`)

    const sessionId = await streamText(
      config,
      messages,
      (channel: string, event: AppEvent) => {
        this._rendererConnection.publishEvent(channel, event)
      },
      toolCount > 0 ? mcpTools : undefined,
      options?.chatSessionId
    )
    return ok(sessionId)
  }

  async abortAIText(sessionId: string): Promise<Result<void>> {
    const success = abortStream(sessionId)
    if (success) {
      logger.info(`AI chat session ${sessionId} successfully aborted`)
    } else {
      logger.warn(`L Attempted to abort non-existent session: ${sessionId}`)
    }
    return ok(undefined)
  }

  async getAIModels(provider: AIProvider): Promise<Result<string[]>> {
    const models = await listAvailableModel(provider)
    return ok(models)
  }

  async testAIProviderConnection(config: AIConfig): Promise<Result<boolean>> {
    const result = await testConnection(config)
    return ok(result)
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

  async testCertificateConnection(settings: CertificateSettings): Promise<Result<ConnectionTestResult>> {
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

  async getProviderConfiguration(configId: string): Promise<Result<AIProviderConfiguration | undefined>> {
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

  async deleteModelFromConfiguration(
    configId: string,
    modelId: string
  ): Promise<Result<void>> {
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
    return ok(session)
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
    // Get per-session settings, or fall back to defaults
    const settingsKey = `compression:${sessionId}`
    const sessionSettings = await getSetting<CompressionSettings>(settingsKey)

    if (sessionSettings) {
      return ok(sessionSettings)
    }

    // Return defaults
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

      const tokenUsage: TokenUsageInfo = {
        currentTokens: contextCheck.currentTokenCount,
        maxTokens: contextCheck.contextLimit,
        inputTokens: contextCheck.currentTokenCount, // Simplified for now
        outputTokens: 0, // Not tracked separately in context check
        estimatedResponseTokens: contextCheck.estimatedResponseTokens,
        utilizationPercentage: contextCheck.utilizationPercentage,
        thresholdPercentage: (contextCheck.thresholdTokenCount / contextCheck.contextLimit) * 100,
        needsCompression: contextCheck.needsCompression
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
      const expectedNewTokens = estimatedSummaryTokens + (contextCheck.currentTokenCount - contextCheck.currentTokenCount * (contextCheck.compressibleMessageCount / (contextCheck.compressibleMessageCount + contextCheck.retainedMessageCount)))

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
}
