import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestDatabase } from './database-helper'
import type { AISettingsV2, AISettingsV3 } from '@common/types'
import {
  getAISettingsV3,
  saveAISettingsV3,
  getProviderConfigurations,
  getProviderConfiguration,
  createProviderConfiguration,
  updateProviderConfiguration,
  deleteProviderConfiguration,
  addModelToConfiguration,
  updateModelInConfiguration,
  deleteModelFromConfiguration
} from '@backend/settings/ai-settings'

// Mock logger to avoid console output during tests
vi.mock('@backend/logger', () => {
  const createLoggerMock = () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => createLoggerMock())
  })
  return {
    default: createLoggerMock()
  }
})

// Mock the db module to use test database
let testDbInstance: any = null

vi.mock('@backend/db', async () => {
  const actual = await vi.importActual('@backend/db')
  return {
    ...actual,
    get db() {
      return testDbInstance
    }
  }
})

describe('AI Settings V3', () => {
  beforeEach(async () => {
    // Create a fresh test database for each test
    testDbInstance = await createTestDatabase()
  })

  describe('V2 to V3 Migration', () => {
    it('should migrate V2 settings to V3 format', async () => {
      // Setup V2 settings
      const v2Settings: AISettingsV2 = {
        version: 2,
        providers: {
          openai: {
            apiKey: 'test-openai-key',
            baseURL: 'https://api.openai.com/v1'
          },
          anthropic: {
            apiKey: 'test-anthropic-key'
          }
        },
        presets: [
          {
            id: 'preset-1',
            name: 'GPT-4',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        defaultPresetId: 'preset-1'
      }

      // Save V2 settings to the correct key
      const { setSetting } = await import('@backend/settings')
      await setSetting('ai_v2', v2Settings)

      // Load as V3 (should auto-migrate)
      const v3Settings = await getAISettingsV3()

      expect(v3Settings.version).toBe(3)
      expect(v3Settings.providerConfigs).toHaveLength(2)

      // Check OpenAI configuration
      const openaiConfig = v3Settings.providerConfigs.find((c) => c.type === 'openai')
      expect(openaiConfig).toBeDefined()
      expect(openaiConfig?.name).toBe('OpenAI')
      expect(openaiConfig?.config.apiKey).toBe('test-openai-key')
      expect(openaiConfig?.enabled).toBe(true)
      expect(openaiConfig?.id).toBeDefined()
      expect(openaiConfig?.createdAt).toBeDefined()

      // Check Anthropic configuration
      const anthropicConfig = v3Settings.providerConfigs.find((c) => c.type === 'anthropic')
      expect(anthropicConfig).toBeDefined()
      expect(anthropicConfig?.name).toBe('Anthropic')
      expect(anthropicConfig?.config.apiKey).toBe('test-anthropic-key')

      // Check default selection migration
      expect(v3Settings.defaultSelection).toBeDefined()
      expect(v3Settings.defaultSelection?.providerConfigId).toBe(openaiConfig?.id)
      expect(v3Settings.defaultSelection?.modelId).toBe('gpt-4')
    })

    it('should preserve V3 settings without re-migration', async () => {
      // Create V3 settings directly
      const v3Settings: AISettingsV3 = {
        version: 3,
        providerConfigs: [
          {
            id: 'test-config-id',
            name: 'Test OpenAI',
            type: 'openai',
            config: { apiKey: 'test-key' },
            models: [{ id: 'gpt-4', source: 'api', addedAt: '2024-01-01T00:00:00.000Z' }],
            modelRefreshEnabled: true,
            enabled: true,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      }

      await saveAISettingsV3(v3Settings)

      // Load again
      const loaded = await getAISettingsV3()

      expect(loaded.version).toBe(3)
      expect(loaded.providerConfigs).toHaveLength(1)
      expect(loaded.providerConfigs[0].id).toBe('test-config-id')
      expect(loaded.providerConfigs[0].name).toBe('Test OpenAI')
    })

    it('should migrate V2 with multiple presets and preserve default', async () => {
      const v2Settings: AISettingsV2 = {
        version: 2,
        providers: {
          openai: { apiKey: 'openai-key' },
          anthropic: { apiKey: 'anthropic-key' },
          google: { apiKey: 'google-key' }
        },
        presets: [
          {
            id: 'preset-1',
            name: 'GPT-4 Turbo',
            provider: 'openai',
            model: 'gpt-4-turbo',
            createdAt: '2024-01-01T00:00:00.000Z'
          },
          {
            id: 'preset-2',
            name: 'Claude Sonnet',
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
            createdAt: '2024-01-02T00:00:00.000Z'
          },
          {
            id: 'preset-3',
            name: 'Gemini Pro',
            provider: 'google',
            model: 'gemini-1.5-pro-latest',
            createdAt: '2024-01-03T00:00:00.000Z'
          }
        ],
        defaultPresetId: 'preset-2' // Claude Sonnet
      }

      const { setSetting } = await import('@backend/settings')
      await setSetting('ai_v2', v2Settings)

      const v3Settings = await getAISettingsV3()

      expect(v3Settings.version).toBe(3)
      expect(v3Settings.providerConfigs).toHaveLength(3)

      // Check default selection migrated to Claude
      const anthropicConfig = v3Settings.providerConfigs.find((c) => c.type === 'anthropic')
      expect(v3Settings.defaultSelection).toBeDefined()
      expect(v3Settings.defaultSelection?.providerConfigId).toBe(anthropicConfig?.id)
      expect(v3Settings.defaultSelection?.modelId).toBe('claude-3-5-sonnet-20241022')
    })

    it('should migrate V2 with Azure provider configuration', async () => {
      const v2Settings: AISettingsV2 = {
        version: 2,
        providers: {
          azure: {
            apiKey: 'azure-key',
            baseURL: 'https://my-resource.openai.azure.com',
            resourceName: 'my-resource',
            useDeploymentBasedUrls: true
          }
        },
        presets: [
          {
            id: 'azure-preset',
            name: 'Azure GPT-4',
            provider: 'azure',
            model: 'gpt-4-deployment',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        defaultPresetId: 'azure-preset'
      }

      const { setSetting } = await import('@backend/settings')
      await setSetting('ai_v2', v2Settings)

      const v3Settings = await getAISettingsV3()

      const azureConfig = v3Settings.providerConfigs.find((c) => c.type === 'azure')
      expect(azureConfig).toBeDefined()
      expect(azureConfig?.name).toBe('Azure OpenAI')
      expect(azureConfig?.config.apiKey).toBe('azure-key')
      expect(azureConfig?.config.baseURL).toBe('https://my-resource.openai.azure.com')
      expect((azureConfig?.config as any).resourceName).toBe('my-resource')
      expect((azureConfig?.config as any).useDeploymentBasedUrls).toBe(true)

      // Check default selection
      expect(v3Settings.defaultSelection?.providerConfigId).toBe(azureConfig?.id)
      expect(v3Settings.defaultSelection?.modelId).toBe('gpt-4-deployment')
    })

    it('should migrate V2 with baseURL in provider config', async () => {
      const v2Settings: AISettingsV2 = {
        version: 2,
        providers: {
          openai: {
            apiKey: 'local-key',
            baseURL: 'http://localhost:8080/v1'
          }
        },
        presets: [
          {
            id: 'local-preset',
            name: 'Local LLM',
            provider: 'openai',
            model: 'llama-3-8b',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      }

      const { setSetting } = await import('@backend/settings')
      await setSetting('ai_v2', v2Settings)

      const v3Settings = await getAISettingsV3()

      const config = v3Settings.providerConfigs.find((c) => c.type === 'openai')
      expect(config?.config.baseURL).toBe('http://localhost:8080/v1')
    })

    it('should migrate V2 with no default preset', async () => {
      const v2Settings: AISettingsV2 = {
        version: 2,
        providers: {
          openai: { apiKey: 'test-key' }
        },
        presets: [
          {
            id: 'preset-1',
            name: 'GPT-4',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
        // No defaultPresetId
      }

      const { setSetting } = await import('@backend/settings')
      await setSetting('ai_v2', v2Settings)

      const v3Settings = await getAISettingsV3()

      expect(v3Settings.version).toBe(3)
      expect(v3Settings.providerConfigs).toHaveLength(1)
      expect(v3Settings.defaultSelection).toBeUndefined()
    })

    it('should migrate V2 with empty presets', async () => {
      const v2Settings: AISettingsV2 = {
        version: 2,
        providers: {
          openai: { apiKey: 'test-key' },
          anthropic: { apiKey: 'test-key2' }
        },
        presets: []
      }

      const { setSetting } = await import('@backend/settings')
      await setSetting('ai_v2', v2Settings)

      const v3Settings = await getAISettingsV3()

      expect(v3Settings.version).toBe(3)
      expect(v3Settings.providerConfigs).toHaveLength(2)
      expect(v3Settings.defaultSelection).toBeUndefined()
    })
  })

  describe('Provider Configuration CRUD', () => {
    it('should create a new provider configuration with auto-generated ID and timestamps', async () => {
      const configId = await createProviderConfiguration({
        name: 'My OpenAI Server',
        type: 'openai',
        config: { apiKey: 'test-key' },
        models: [],
        modelRefreshEnabled: true,
        enabled: true
      })

      expect(configId).toBeDefined()
      expect(typeof configId).toBe('string')

      const config = await getProviderConfiguration(configId)
      expect(config).toBeDefined()
      expect(config?.name).toBe('My OpenAI Server')
      expect(config?.type).toBe('openai')
      expect(config?.id).toBe(configId)
      expect(config?.createdAt).toBeDefined()
      expect(config?.updatedAt).toBeDefined()
    })

    it('should retrieve all provider configurations', async () => {
      await createProviderConfiguration({
        name: 'OpenAI Official',
        type: 'openai',
        config: { apiKey: 'key1' },
        models: [],
        modelRefreshEnabled: true,
        enabled: true
      })

      await createProviderConfiguration({
        name: 'LocalLM',
        type: 'openai',
        config: { apiKey: 'key2', baseURL: 'http://localhost:8080' },
        models: [],
        modelRefreshEnabled: true,
        enabled: true
      })

      const configs = await getProviderConfigurations()
      expect(configs).toHaveLength(2)
      expect(configs.find((c) => c.name === 'OpenAI Official')).toBeDefined()
      expect(configs.find((c) => c.name === 'LocalLM')).toBeDefined()
    })

    it('should update a provider configuration', async () => {
      const configId = await createProviderConfiguration({
        name: 'Original Name',
        type: 'openai',
        config: { apiKey: 'original-key' },
        models: [],
        modelRefreshEnabled: true,
        enabled: true
      })

      await updateProviderConfiguration(configId, {
        name: 'Updated Name',
        config: { apiKey: 'updated-key' }
      })

      const config = await getProviderConfiguration(configId)
      expect(config?.name).toBe('Updated Name')
      expect(config?.config.apiKey).toBe('updated-key')
      expect(config?.updatedAt).toBeDefined()
    })

    it('should delete a provider configuration', async () => {
      const configId = await createProviderConfiguration({
        name: 'To Delete',
        type: 'openai',
        config: { apiKey: 'test-key' },
        models: [],
        modelRefreshEnabled: true,
        enabled: true
      })

      await deleteProviderConfiguration(configId)

      const config = await getProviderConfiguration(configId)
      expect(config).toBeUndefined()
    })

    it('should clear default selection when deleting the selected provider config', async () => {
      const configId = await createProviderConfiguration({
        name: 'Test Provider',
        type: 'openai',
        config: { apiKey: 'test-key' },
        models: [{ id: 'gpt-4', source: 'api', addedAt: '2024-01-01T00:00:00.000Z' }],
        modelRefreshEnabled: true,
        enabled: true
      })

      // Set default selection
      const settings = await getAISettingsV3()
      settings.defaultSelection = {
        providerConfigId: configId,
        modelId: 'gpt-4'
      }
      await saveAISettingsV3(settings)

      // Delete the provider config
      await deleteProviderConfiguration(configId)

      // Check that default selection is cleared
      const updatedSettings = await getAISettingsV3()
      expect(updatedSettings.defaultSelection).toBeUndefined()
    })
  })

  describe('Model Management', () => {
    let configId: string

    beforeEach(async () => {
      configId = await createProviderConfiguration({
        name: 'Test Provider',
        type: 'openai',
        config: { apiKey: 'test-key' },
        models: [
          { id: 'gpt-4', source: 'api', addedAt: '2024-01-01T00:00:00.000Z' },
          { id: 'gpt-3.5-turbo', source: 'api', addedAt: '2024-01-01T00:00:00.000Z' }
        ],
        modelRefreshEnabled: true,
        enabled: true
      })
    })

    it('should add a custom model to configuration', async () => {
      await addModelToConfiguration(configId, {
        id: 'custom-model',
        displayName: 'My Custom Model'
      })

      const config = await getProviderConfiguration(configId)
      expect(config?.models).toHaveLength(3)

      const customModel = config?.models.find((m) => m.id === 'custom-model')
      expect(customModel).toBeDefined()
      expect(customModel?.source).toBe('custom')
      expect(customModel?.displayName).toBe('My Custom Model')
      expect(customModel?.addedAt).toBeDefined()
    })

    it('should reject duplicate model IDs', async () => {
      await expect(
        addModelToConfiguration(configId, {
          id: 'gpt-4' // Already exists
        })
      ).rejects.toThrow('Model already exists')
    })

    it('should update a model in configuration', async () => {
      await updateModelInConfiguration(configId, 'gpt-4', {
        displayName: 'GPT-4 Updated',
        description: 'Updated description'
      })

      const config = await getProviderConfiguration(configId)
      const model = config?.models.find((m) => m.id === 'gpt-4')
      expect(model?.displayName).toBe('GPT-4 Updated')
      expect(model?.description).toBe('Updated description')
    })

    it('should delete a model from configuration', async () => {
      await deleteModelFromConfiguration(configId, 'gpt-3.5-turbo')

      const config = await getProviderConfiguration(configId)
      expect(config?.models).toHaveLength(1)
      expect(config?.models.find((m) => m.id === 'gpt-3.5-turbo')).toBeUndefined()
    })

    it('should clear default selection when deleting the selected model', async () => {
      // Set default selection
      const settings = await getAISettingsV3()
      settings.defaultSelection = {
        providerConfigId: configId,
        modelId: 'gpt-4'
      }
      await saveAISettingsV3(settings)

      // Delete the model
      await deleteModelFromConfiguration(configId, 'gpt-4')

      // Check that default selection is cleared
      const updatedSettings = await getAISettingsV3()
      expect(updatedSettings.defaultSelection).toBeUndefined()
    })
  })
})
