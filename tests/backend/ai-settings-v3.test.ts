import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestDatabase } from './database-helper'
import type { AISettingsV2, AISettings } from '@common/types'
import {
  getAISettingsV2,
  saveAISettingsV2,
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

describe('AI Settings V2', () => {
  beforeEach(async () => {
    // Create a fresh test database for each test
    testDbInstance = await createTestDatabase()
  })

  describe('V1 to V2 Migration', () => {
    it('should migrate V1 settings to V2 format', async () => {
      // Setup V1 settings
      const v1Settings: AISettings = {
        default_provider: 'openai',
        openai_api_key: 'test-openai-key',
        openai_model: 'gpt-4',
        anthropic_api_key: 'test-anthropic-key'
      }

      // Save V1 settings to the correct key
      const { setSetting } = await import('@backend/settings')
      await setSetting('ai', v1Settings)

      // Load as V2 (should auto-migrate)
      const v2Settings = await getAISettingsV2()

      expect(v2Settings.version).toBe(2)
      expect(v2Settings.providerConfigs).toHaveLength(2)

      // Check OpenAI configuration
      const openaiConfig = v2Settings.providerConfigs.find((c) => c.type === 'openai')
      expect(openaiConfig).toBeDefined()
      expect(openaiConfig?.name).toBe('OpenAI')
      expect(openaiConfig?.config.apiKey).toBe('test-openai-key')
      expect(openaiConfig?.enabled).toBe(true)
      expect(openaiConfig?.id).toBeDefined()
      expect(openaiConfig?.createdAt).toBeDefined()

      // Check Anthropic configuration
      const anthropicConfig = v2Settings.providerConfigs.find((c) => c.type === 'anthropic')
      expect(anthropicConfig).toBeDefined()
      expect(anthropicConfig?.name).toBe('Anthropic')
      expect(anthropicConfig?.config.apiKey).toBe('test-anthropic-key')

      // Check default selection migration
      expect(v2Settings.defaultSelection).toBeDefined()
      expect(v2Settings.defaultSelection?.providerConfigId).toBe(openaiConfig?.id)
      expect(v2Settings.defaultSelection?.modelId).toBe('gpt-4')
    })

    it('should preserve V2 settings without re-migration', async () => {
      // Create V2 settings directly
      const v2Settings: AISettingsV2 = {
        version: 2,
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

      await saveAISettingsV2(v2Settings)

      // Load again
      const loaded = await getAISettingsV2()

      expect(loaded.version).toBe(2)
      expect(loaded.providerConfigs).toHaveLength(1)
      expect(loaded.providerConfigs[0].id).toBe('test-config-id')
      expect(loaded.providerConfigs[0].name).toBe('Test OpenAI')
    })

    it('should migrate V1 with multiple providers and preserve default', async () => {
      const v1Settings: AISettings = {
        default_provider: 'anthropic',
        openai_api_key: 'openai-key',
        openai_model: 'gpt-4-turbo',
        anthropic_api_key: 'anthropic-key',
        anthropic_model: 'claude-3-5-sonnet-20241022',
        google_api_key: 'google-key',
        google_model: 'gemini-1.5-pro-latest'
      }

      const { setSetting } = await import('@backend/settings')
      await setSetting('ai', v1Settings)

      const v2Settings = await getAISettingsV2()

      expect(v2Settings.version).toBe(2)
      expect(v2Settings.providerConfigs).toHaveLength(3)

      // Check default selection migrated to Claude
      const anthropicConfig = v2Settings.providerConfigs.find((c) => c.type === 'anthropic')
      expect(v2Settings.defaultSelection).toBeDefined()
      expect(v2Settings.defaultSelection?.providerConfigId).toBe(anthropicConfig?.id)
      expect(v2Settings.defaultSelection?.modelId).toBe('claude-3-5-sonnet-20241022')
    })

    it('should migrate V1 with Azure provider configuration', async () => {
      const v1Settings: AISettings = {
        default_provider: 'azure',
        azure_api_key: 'azure-key',
        azure_model: 'gpt-4-deployment'
      }

      const { setSetting } = await import('@backend/settings')
      await setSetting('ai', v1Settings)

      const v2Settings = await getAISettingsV2()

      const azureConfig = v2Settings.providerConfigs.find((c) => c.type === 'azure')
      expect(azureConfig).toBeDefined()
      expect(azureConfig?.name).toBe('Azure OpenAI')
      expect(azureConfig?.config.apiKey).toBe('azure-key')

      // Check default selection
      expect(v2Settings.defaultSelection?.providerConfigId).toBe(azureConfig?.id)
      expect(v2Settings.defaultSelection?.modelId).toBe('gpt-4-deployment')
    })

    it('should migrate V1 without baseURL (V1 did not support baseURL)', async () => {
      const v1Settings: AISettings = {
        default_provider: 'openai',
        openai_api_key: 'openai-key',
        openai_model: 'gpt-4'
      }

      const { setSetting } = await import('@backend/settings')
      await setSetting('ai', v1Settings)

      const v2Settings = await getAISettingsV2()

      const config = v2Settings.providerConfigs.find((c) => c.type === 'openai')
      expect(config?.config.apiKey).toBe('openai-key')
      expect(config?.config.baseURL).toBeUndefined()
    })

    it('should migrate V1 with no default provider', async () => {
      const v1Settings: AISettings = {
        openai_api_key: 'test-key',
        openai_model: 'gpt-4'
        // No default_provider
      }

      const { setSetting } = await import('@backend/settings')
      await setSetting('ai', v1Settings)

      const v2Settings = await getAISettingsV2()

      expect(v2Settings.version).toBe(2)
      expect(v2Settings.providerConfigs).toHaveLength(1)
      expect(v2Settings.defaultSelection).toBeUndefined()
    })

    it('should migrate V1 with multiple providers and no default', async () => {
      const v1Settings: AISettings = {
        openai_api_key: 'test-key',
        anthropic_api_key: 'test-key2'
        // No default_provider
      }

      const { setSetting } = await import('@backend/settings')
      await setSetting('ai', v1Settings)

      const v2Settings = await getAISettingsV2()

      expect(v2Settings.version).toBe(2)
      expect(v2Settings.providerConfigs).toHaveLength(2)
      expect(v2Settings.defaultSelection).toBeUndefined()
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
      const settings = await getAISettingsV2()
      settings.defaultSelection = {
        providerConfigId: configId,
        modelId: 'gpt-4'
      }
      await saveAISettingsV2(settings)

      // Delete the provider config
      await deleteProviderConfiguration(configId)

      // Check that default selection is cleared
      const updatedSettings = await getAISettingsV2()
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
      const settings = await getAISettingsV2()
      settings.defaultSelection = {
        providerConfigId: configId,
        modelId: 'gpt-4'
      }
      await saveAISettingsV2(settings)

      // Delete the model
      await deleteModelFromConfiguration(configId, 'gpt-4')

      // Check that default selection is cleared
      const updatedSettings = await getAISettingsV2()
      expect(updatedSettings.defaultSelection).toBeUndefined()
    })
  })
})
