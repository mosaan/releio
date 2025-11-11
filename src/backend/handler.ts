import { Connection } from '@common/connection'
import type { Result, AIProvider, AIConfig, AISettings, AIMessage, AppEvent, ProxySettings, CertificateSettings, ConnectionTestResult } from '@common/types'
import { ok, error, isOk } from '@common/result'
import { dirname } from 'path'
import { getSetting, setSetting, getAllSettings, clearSetting } from './settings'
import { getDatabasePath, getLogPath } from './paths'
import logger from './logger'
import { streamText, abortStream, listAvailableModel, testConnection } from './ai'
import { FACTORY } from './ai/factory'
import { close, db, destroy } from './db'
import { getProxySettings, setProxySettings, getSystemProxySettings } from './settings/proxy'
import { getCertificateSettings, setCertificateSettings, getSystemCertificateSettings } from './settings/certificate'
import { testProxyConnection, testCertificateConnection, testCombinedConnection } from './settings/connectionTest'

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
  async streamAIText(messages: AIMessage[]): Promise<Result<string>> {
    // Get AI settings from database
    const aiSettings = await getSetting<AISettings>('ai')

    if (!aiSettings) throw new Error('No AI setting has been created')

    if (!aiSettings.default_provider)
      throw new Error('No default AI provider found in the settings')

    // Determine which provider to use
    const selectedProvider = aiSettings.default_provider!

    // Get API key for the selected provider
    const apiKeyField = `${selectedProvider}_api_key` as keyof AISettings
    const apiKey = aiSettings[apiKeyField] as string

    if (!apiKey) {
      throw new Error(`API key not found for provider: ${selectedProvider}`)
    }

    // Get model for the selected provider
    const modelField = `${selectedProvider}_model` as keyof AISettings
    const model = (aiSettings[modelField] as string) || FACTORY[selectedProvider].default

    // Create config object
    const config: AIConfig = {
      provider: selectedProvider,
      model,
      apiKey
    }

    const sessionId = await streamText(config, messages, (channel: string, event: AppEvent) => {
      this._rendererConnection.publishEvent(channel, event)
    })
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

  // Proxy handlers
  async getProxySettings(): Promise<Result<ProxySettings>> {
    const settings = await getProxySettings()
    return ok(settings)
  }

  async setProxySettings(settings: ProxySettings): Promise<Result<void>> {
    await setProxySettings(settings)
    return ok(undefined)
  }

  async getSystemProxySettings(): Promise<Result<ProxySettings>> {
    const settings = await getSystemProxySettings()
    return ok(settings)
  }

  // Certificate handlers
  async getCertificateSettings(): Promise<Result<CertificateSettings>> {
    const settings = await getCertificateSettings()
    return ok(settings)
  }

  async setCertificateSettings(settings: CertificateSettings): Promise<Result<void>> {
    await setCertificateSettings(settings)
    return ok(undefined)
  }

  async getSystemCertificateSettings(): Promise<Result<CertificateSettings>> {
    const settings = await getSystemCertificateSettings()
    return ok(settings)
  }

  // Connection test handlers
  async testProxyConnection(settings: ProxySettings): Promise<Result<ConnectionTestResult>> {
    const result = await testProxyConnection(settings)
    return ok(result)
  }

  async testCertificateConnection(settings: CertificateSettings): Promise<Result<ConnectionTestResult>> {
    const result = await testCertificateConnection(settings)
    return ok(result)
  }

  async testCombinedConnection(
    proxySettings: ProxySettings,
    certSettings: CertificateSettings
  ): Promise<Result<ConnectionTestResult>> {
    const result = await testCombinedConnection(proxySettings, certSettings)
    return ok(result)
  }

  async testFullConnection(): Promise<Result<ConnectionTestResult, string>> {
    // Get current proxy and certificate settings
    const proxyResult = await this.getProxySettings()
    const certResult = await this.getCertificateSettings()

    if (!isOk(proxyResult) || !isOk(certResult)) {
      return error('Failed to load current settings')
    }

    const result = await testCombinedConnection(proxyResult.value, certResult.value)
    return ok(result)
  }
}
