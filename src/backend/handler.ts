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
  AIModelPreset,
  AIProviderConfig,
  AzureProviderConfig
} from '@common/types'
import { ok, error, isOk } from '@common/result'
import { dirname } from 'path'
import { getSetting, setSetting, getAllSettings, clearSetting } from './settings'
import { getDatabasePath, getLogPath } from './paths'
import logger from './logger'
import { streamText, abortStream, listAvailableModel, testConnection } from './ai'
import { FACTORY } from './ai/factory'
import { close, db, destroy } from './db'
import { mcpManager } from './mcp'
import { getProxySettings as loadProxySettings, setProxySettings as saveProxySettings, getSystemProxySettings as loadSystemProxySettings } from './settings/proxy'
import { getCertificateSettings as loadCertificateSettings, setCertificateSettings as saveCertificateSettings, getSystemCertificateSettings as loadSystemCertificateSettings } from './settings/certificate'
import { testProxyConnection as runProxyTest, testCertificateConnection as runCertificateTest, testCombinedConnection as runCombinedTest } from './settings/connectionTest'
import {
  getAISettingsV2 as loadAISettingsV2,
  saveAISettingsV2,
  getAIPresets as loadAIPresets,
  createAIPreset as newAIPreset,
  updateAIPreset as modifyAIPreset,
  deleteAIPreset as removeAIPreset,
  updateProviderConfig as modifyProviderConfig,
  getProviderConfig as loadProviderConfig
} from './settings/ai-settings'

export class Handler {
  private _rendererConnection: Connection

  constructor({ rendererConnetion }: { rendererConnetion: Connection }) {
    this._rendererConnection = rendererConnetion
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

  async clearDatabase(): Promise<Result<void, string>> {
    close(db)
    destroy()
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
    // Load v2 settings (auto-migrates from v1 if needed)
    const settingsV2 = await loadAISettingsV2()

    let selectedPreset: AIModelPreset | undefined
    let selectedProvider: AIProvider
    let selectedModel: string
    let apiKey: string

    // Resolution logic: preset ID → explicit provider/model → default preset → first available preset
    if (options?.presetId) {
      // Use specified preset
      selectedPreset = settingsV2.presets.find(p => p.id === options.presetId)
      if (!selectedPreset) {
        throw new Error(`Preset not found: ${options.presetId}`)
      }
      logger.info(`Using preset: ${selectedPreset.name} (${selectedPreset.id})`)
    } else if (options?.provider) {
      // Use explicit provider/model override
      selectedProvider = options.provider
      selectedModel = options.model || FACTORY[selectedProvider].default

      logger.info(`Using explicit provider override: ${selectedProvider} - ${selectedModel}`)
    } else if (settingsV2.defaultPresetId) {
      // Use default preset
      selectedPreset = settingsV2.presets.find(p => p.id === settingsV2.defaultPresetId)
      if (!selectedPreset) {
        throw new Error(`Default preset not found: ${settingsV2.defaultPresetId}`)
      }
      logger.info(`Using default preset: ${selectedPreset.name}`)
    } else if (settingsV2.presets.length > 0) {
      // Use first available preset with valid API key
      for (const preset of settingsV2.presets) {
        const providerConfig = settingsV2.providers[preset.provider]
        if (providerConfig?.apiKey) {
          selectedPreset = preset
          break
        }
      }
      if (!selectedPreset) {
        throw new Error('No preset with valid API key found')
      }
      logger.info(`Using first available preset: ${selectedPreset.name}`)
    } else {
      // Fallback to v1 settings if no presets
      logger.warn('No v2 presets found, falling back to v1 settings')
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

    // Extract provider, model, and API key from preset
    if (selectedPreset) {
      selectedProvider = selectedPreset.provider
      selectedModel = selectedPreset.model

      const providerConfig = settingsV2.providers[selectedProvider]
      if (!providerConfig?.apiKey) {
        throw new Error(`API key not configured for provider: ${selectedProvider}`)
      }
      apiKey = providerConfig.apiKey
    }

    // Create config object
    const config: AIConfig = {
      provider: selectedProvider!,
      model: selectedModel!,
      apiKey: apiKey!
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
      toolCount > 0 ? mcpTools : undefined
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

  async getAIPresets(): Promise<Result<AIModelPreset[]>> {
    const presets = await loadAIPresets()
    return ok(presets)
  }

  async createAIPreset(preset: Omit<AIModelPreset, 'id' | 'createdAt'>): Promise<Result<string>> {
    const presetId = await newAIPreset(preset)
    return ok(presetId)
  }

  async updateAIPreset(
    presetId: string,
    updates: Partial<Omit<AIModelPreset, 'id' | 'createdAt'>>
  ): Promise<Result<void>> {
    await modifyAIPreset(presetId, updates)
    return ok(undefined)
  }

  async deleteAIPreset(presetId: string): Promise<Result<void>> {
    await removeAIPreset(presetId)
    return ok(undefined)
  }

  async updateProviderConfig(
    provider: AIProvider,
    config: AIProviderConfig | AzureProviderConfig
  ): Promise<Result<void>> {
    await modifyProviderConfig(provider, config)
    return ok(undefined)
  }

  async getProviderConfig(
    provider: AIProvider
  ): Promise<Result<AIProviderConfig | AzureProviderConfig | undefined>> {
    const config = await loadProviderConfig(provider)
    return ok(config)
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
}
