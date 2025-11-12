import { randomUUID } from 'crypto'
import type {
  AISettings,
  AISettingsV2,
  AIProvider,
  AIProviderConfig,
  AzureProviderConfig,
  AIProviderConfiguration,
  AIModelDefinition
} from '@common/types'
import { getSetting, setSetting } from './index'
import logger from '../logger'
import { FACTORY } from '../ai/factory'
import { createCustomFetch } from '../ai/fetch'

const aiLogger = logger.child('settings:ai')

/**
 * Get default provider name for a given provider type
 */
function getDefaultProviderName(type: AIProvider): string {
  const providerNames: Record<AIProvider, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    azure: 'Azure OpenAI'
  }
  return providerNames[type]
}

/**
 * Get default models for a given provider type from FACTORY
 */
function getDefaultModelsForType(type: AIProvider): AIModelDefinition[] {
  const models = FACTORY[type]?.available || []
  const now = new Date().toISOString()

  return models.map((id) => ({
    id,
    source: 'api' as const,
    addedAt: now
  }))
}

/**
 * Migrate v1 settings directly to v2 format
 * (skips intermediate preset-based approach, directly creates provider configurations)
 */
export function migrateAISettingsV1ToV2Direct(v1: AISettings): AISettingsV2 {
  aiLogger.info('Migrating AI settings from v1 to v2')

  const v2: AISettingsV2 = {
    version: 2,
    providerConfigs: []
  }

  // Step 1: Create provider configurations from v1 settings
  const providers: AIProvider[] = ['openai', 'anthropic', 'google', 'azure']

  for (const type of providers) {
    const apiKey = v1[`${type}_api_key`]
    if (!apiKey) continue

    const providerConfigId = randomUUID()
    const now = new Date().toISOString()

    // Create basic provider config
    const config: AIProviderConfig | AzureProviderConfig =
      type === 'azure' ? { apiKey } : { apiKey }

    const providerConfig: AIProviderConfiguration = {
      id: providerConfigId,
      name: getDefaultProviderName(type),
      type: type,
      config: config,
      models: getDefaultModelsForType(type),
      modelRefreshEnabled: true,
      enabled: true,
      createdAt: now,
      updatedAt: now
    }

    v2.providerConfigs.push(providerConfig)
    aiLogger.debug(`Migrated ${type} provider from v1 to v2`)
  }

  // Step 2: Set default selection from v1.default_provider
  if (v1.default_provider) {
    const matchingConfig = v2.providerConfigs.find((c) => c.type === v1.default_provider)
    if (matchingConfig) {
      const defaultModel =
        v1[`${v1.default_provider}_model`] || FACTORY[v1.default_provider]?.default
      if (defaultModel) {
        v2.defaultSelection = {
          providerConfigId: matchingConfig.id,
          modelId: defaultModel
        }
        aiLogger.debug(`Set default selection: ${v1.default_provider} - ${defaultModel}`)
      }
    }
  }

  aiLogger.info(`Migration complete: ${v2.providerConfigs.length} provider config(s) created`)
  return v2
}

/**
 * Get AI settings v2, performing migration from v1 if necessary
 */
export async function getAISettingsV2(): Promise<AISettingsV2> {
  try {
    // Try to get v2 settings first
    const v2Settings = await getSetting<AISettingsV2>('ai_v2')
    if (v2Settings && v2Settings.version === 2) {
      // Defensive: Ensure providerConfigs array exists
      if (!v2Settings.providerConfigs || !Array.isArray(v2Settings.providerConfigs)) {
        aiLogger.warn('v2 settings missing or invalid providerConfigs, reinitializing')
        const fixedSettings: AISettingsV2 = {
          version: 2,
          providerConfigs: [],
          defaultSelection: v2Settings.defaultSelection
        }
        await setSetting('ai_v2', fixedSettings)
        return fixedSettings
      }
      aiLogger.debug('Loaded AI settings v2')
      return v2Settings
    }
  } catch (error) {
    aiLogger.debug('No v2 settings found, checking for v1')
  }

  // Try v1 settings and migrate directly to v2
  try {
    const v1Settings = await getSetting<AISettings>('ai')
    if (v1Settings) {
      aiLogger.info('Found v1 settings, migrating to v2')
      const v2Settings = migrateAISettingsV1ToV2Direct(v1Settings)

      // Save migrated settings
      await setSetting('ai_v2', v2Settings)
      aiLogger.info('Saved migrated v2 settings')

      return v2Settings
    }
  } catch (error) {
    aiLogger.debug('No v1 settings found')
  }

  // Return empty v2 settings if nothing exists
  aiLogger.info('Initializing empty AI settings v2')
  const emptySettings: AISettingsV2 = {
    version: 2,
    providerConfigs: []
  }

  await setSetting('ai_v2', emptySettings)
  return emptySettings
}

/**
 * Save AI settings v2
 */
export async function saveAISettingsV2(settings: AISettingsV2): Promise<void> {
  aiLogger.info('Saving AI settings v2')
  await setSetting('ai_v2', settings)
}

/**
 * Get all provider configurations
 */
export async function getProviderConfigurations(): Promise<AIProviderConfiguration[]> {
  const settings = await getAISettingsV2()
  return settings.providerConfigs
}

/**
 * Get a specific provider configuration by ID
 */
export async function getProviderConfiguration(
  configId: string
): Promise<AIProviderConfiguration | undefined> {
  const settings = await getAISettingsV2()
  return settings.providerConfigs.find((c) => c.id === configId)
}

/**
 * Create a new provider configuration
 */
export async function createProviderConfiguration(
  config: Omit<AIProviderConfiguration, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const settings = await getAISettingsV2()

  const now = new Date().toISOString()
  const newConfig: AIProviderConfiguration = {
    ...config,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now
  }

  settings.providerConfigs.push(newConfig)
  await saveAISettingsV2(settings)

  aiLogger.info(`Created provider configuration: ${newConfig.name} (${newConfig.id})`)
  return newConfig.id
}

/**
 * Update an existing provider configuration
 */
export async function updateProviderConfiguration(
  configId: string,
  updates: Partial<Omit<AIProviderConfiguration, 'id' | 'createdAt'>>
): Promise<void> {
  const settings = await getAISettingsV2()

  const configIndex = settings.providerConfigs.findIndex((c) => c.id === configId)
  if (configIndex === -1) {
    throw new Error(`Provider configuration not found: ${configId}`)
  }

  const config = settings.providerConfigs[configIndex]

  // Apply updates
  settings.providerConfigs[configIndex] = {
    ...config,
    ...updates,
    id: config.id, // Preserve ID
    createdAt: config.createdAt, // Preserve creation time
    updatedAt: new Date().toISOString() // Update modification time
  }

  await saveAISettingsV2(settings)
  aiLogger.info(`Updated provider configuration: ${configId}`)
}

/**
 * Delete a provider configuration
 */
export async function deleteProviderConfiguration(configId: string): Promise<void> {
  const settings = await getAISettingsV2()

  const configIndex = settings.providerConfigs.findIndex((c) => c.id === configId)
  if (configIndex === -1) {
    throw new Error(`Provider configuration not found: ${configId}`)
  }

  settings.providerConfigs.splice(configIndex, 1)

  // Clear default selection if it was the deleted config
  if (settings.defaultSelection?.providerConfigId === configId) {
    settings.defaultSelection = undefined
  }

  await saveAISettingsV2(settings)
  aiLogger.info(`Deleted provider configuration: ${configId}`)
}

/**
 * Add a custom model to a provider configuration
 */
export async function addModelToConfiguration(
  configId: string,
  model: Omit<AIModelDefinition, 'source' | 'addedAt'>
): Promise<void> {
  const settings = await getAISettingsV2()

  const config = settings.providerConfigs.find((c) => c.id === configId)
  if (!config) {
    throw new Error(`Provider configuration not found: ${configId}`)
  }

  // Check if model already exists
  if (config.models.some((m) => m.id === model.id)) {
    throw new Error(`Model already exists: ${model.id}`)
  }

  const newModel: AIModelDefinition = {
    ...model,
    source: 'custom',
    addedAt: new Date().toISOString()
  }

  config.models.push(newModel)
  config.updatedAt = new Date().toISOString()

  await saveAISettingsV2(settings)
  aiLogger.info(`Added custom model ${newModel.id} to configuration ${configId}`)
}

/**
 * Update a model in a provider configuration
 */
export async function updateModelInConfiguration(
  configId: string,
  modelId: string,
  updates: Partial<Omit<AIModelDefinition, 'id' | 'source' | 'addedAt'>>
): Promise<void> {
  const settings = await getAISettingsV2()

  const config = settings.providerConfigs.find((c) => c.id === configId)
  if (!config) {
    throw new Error(`Provider configuration not found: ${configId}`)
  }

  const modelIndex = config.models.findIndex((m) => m.id === modelId)
  if (modelIndex === -1) {
    throw new Error(`Model not found: ${modelId}`)
  }

  const model = config.models[modelIndex]

  // Apply updates
  config.models[modelIndex] = {
    ...model,
    ...updates,
    id: model.id, // Preserve ID
    source: model.source, // Preserve source
    addedAt: model.addedAt // Preserve added time
  }

  config.updatedAt = new Date().toISOString()

  await saveAISettingsV2(settings)
  aiLogger.info(`Updated model ${modelId} in configuration ${configId}`)
}

/**
 * Delete a model from a provider configuration
 */
export async function deleteModelFromConfiguration(
  configId: string,
  modelId: string
): Promise<void> {
  const settings = await getAISettingsV2()

  const config = settings.providerConfigs.find((c) => c.id === configId)
  if (!config) {
    throw new Error(`Provider configuration not found: ${configId}`)
  }

  const modelIndex = config.models.findIndex((m) => m.id === modelId)
  if (modelIndex === -1) {
    throw new Error(`Model not found: ${modelId}`)
  }

  config.models.splice(modelIndex, 1)
  config.updatedAt = new Date().toISOString()

  // Clear default selection if it was the deleted model
  if (
    settings.defaultSelection?.providerConfigId === configId &&
    settings.defaultSelection?.modelId === modelId
  ) {
    settings.defaultSelection = undefined
  }

  await saveAISettingsV2(settings)
  aiLogger.info(`Deleted model ${modelId} from configuration ${configId}`)
}

/**
 * Discover available models from a provider API
 * Returns list of model IDs available from the provider
 */
async function discoverModels(
  providerType: AIProvider,
  apiKey: string,
  baseURL?: string
): Promise<string[]> {
  try {
    switch (providerType) {
      case 'openai': {
        // Use OpenAI's /v1/models endpoint
        const url = baseURL ? `${baseURL}/v1/models` : 'https://api.openai.com/v1/models'
        const customFetch = await createCustomFetch()

        aiLogger.debug(`Fetching OpenAI models from ${url}`)
        const response = await customFetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          aiLogger.warn(`OpenAI models API returned ${response.status}: ${response.statusText}`)
          return []
        }

        const data = await response.json()
        const modelIds = data.data?.map((m: any) => m.id) || []
        aiLogger.info(`Discovered ${modelIds.length} OpenAI models`)
        return modelIds
      }

      case 'anthropic': {
        // Anthropic doesn't have a model listing API
        // Return empty array to keep existing models unchanged
        aiLogger.info('Anthropic does not support API-based model discovery')
        return []
      }

      case 'google': {
        // Google Gemini doesn't have a simple model listing API
        // Return empty array to keep existing models unchanged
        aiLogger.info('Google does not support API-based model discovery')
        return []
      }

      case 'azure': {
        // Azure OpenAI uses /v1/models endpoint (OpenAI-compatible)
        if (!baseURL) {
          aiLogger.warn('Azure model discovery requires baseURL')
          return []
        }

        const url = `${baseURL}/v1/models`
        const customFetch = await createCustomFetch()

        aiLogger.debug(`Fetching Azure models from ${url}`)
        const response = await customFetch(url, {
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          aiLogger.warn(`Azure models API returned ${response.status}: ${response.statusText}`)
          return []
        }

        const data = await response.json()
        const modelIds = data.data?.map((m: any) => m.id) || []
        aiLogger.info(`Discovered ${modelIds.length} Azure models`)
        return modelIds
      }

      default:
        aiLogger.warn(`Unknown provider type: ${providerType}`)
        return []
    }
  } catch (error) {
    aiLogger.error(`Error discovering models for ${providerType}:`, error)
    return []
  }
}

/**
 * Refresh models from API for a provider configuration
 * Replaces ALL API-sourced models with fresh data from the provider API
 * Custom models are preserved
 */
export async function refreshModelsFromAPI(configId: string): Promise<AIModelDefinition[]> {
  const settings = await getAISettingsV2()

  const config = settings.providerConfigs.find((c) => c.id === configId)
  if (!config) {
    throw new Error(`Provider configuration not found: ${configId}`)
  }

  aiLogger.info(`Refreshing models for ${config.name} (${config.type})`)

  // Step 1: Fetch latest models from API
  const apiModelIds = await discoverModels(config.type, config.config.apiKey, config.config.baseURL)

  if (apiModelIds.length === 0) {
    aiLogger.warn(
      `No models discovered from API for ${config.name}. Keeping existing models unchanged.`
    )
    return config.models
  }

  // Step 2: Preserve custom models, replace ALL API-sourced models
  const existingCustomModels = config.models.filter((m) => m.source === 'custom')
  const now = new Date().toISOString()

  const newApiModels: AIModelDefinition[] = apiModelIds.map((id) => ({
    id,
    source: 'api',
    isAvailable: true,
    lastChecked: now,
    addedAt: now
  }))

  // Step 3: Combine custom models (preserved) + new API models (replaced)
  config.models = [...existingCustomModels, ...newApiModels]
  config.modelLastRefreshed = now
  config.updatedAt = now

  await saveAISettingsV2(settings)

  aiLogger.info(
    `Model refresh complete: ${newApiModels.length} API models, ${existingCustomModels.length} custom models`
  )

  return config.models
}
