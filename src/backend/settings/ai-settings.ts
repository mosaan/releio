import { randomUUID } from 'crypto'
import type {
  AISettings,
  AISettingsV2,
  AISettingsV3,
  AIProvider,
  AIProviderConfig,
  AzureProviderConfig,
  AIModelPreset,
  AIProviderConfiguration,
  AIModelDefinition
} from '@common/types'
import { getSetting, setSetting } from './index'
import logger from '../logger'
import { FACTORY } from '../ai/factory'
import { createCustomFetch } from '../ai/fetch'

const aiLogger = logger.child('settings:ai')

/**
 * Generate a preset name from provider and model
 */
function generatePresetName(provider: AIProvider, model: string): string {
  const providerNames: Record<AIProvider, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    azure: 'Azure OpenAI'
  }
  return `${providerNames[provider]} - ${model}`
}

/**
 * Migrate v1 settings to v2 format
 */
export function migrateAISettingsV1ToV2(v1: AISettings): AISettingsV2 {
  aiLogger.info('Migrating AI settings from v1 to v2')

  const v2: AISettingsV2 = {
    version: 2,
    providers: {},
    presets: []
  }

  // Migrate provider configurations
  const providers: AIProvider[] = ['openai', 'anthropic', 'google', 'azure']

  for (const provider of providers) {
    const apiKey = v1[`${provider}_api_key`]
    if (apiKey) {
      if (provider === 'azure') {
        v2.providers.azure = {
          apiKey
        } as AzureProviderConfig
      } else {
        v2.providers[provider] = {
          apiKey
        } as AIProviderConfig
      }
      aiLogger.debug(`Migrated ${provider} provider configuration`)
    }
  }

  // Create default preset from v1 default_provider
  if (v1.default_provider) {
    const defaultProvider = v1.default_provider
    const defaultModel = v1[`${defaultProvider}_model`] || FACTORY[defaultProvider]?.default

    if (defaultModel && v2.providers[defaultProvider]) {
      const presetId = randomUUID()
      const preset: AIModelPreset = {
        id: presetId,
        name: 'Default',
        provider: defaultProvider,
        model: defaultModel,
        createdAt: new Date().toISOString()
      }
      v2.presets.push(preset)
      v2.defaultPresetId = presetId
      aiLogger.info(`Created default preset: ${preset.name} (${defaultProvider} - ${defaultModel})`)
    }
  }

  aiLogger.info(`Migration complete: ${v2.presets.length} preset(s) created`)
  return v2
}

/**
 * Get AI settings v2, performing migration if necessary
 */
export async function getAISettingsV2(): Promise<AISettingsV2> {
  try {
    // Try to get v2 settings first
    const v2Settings = await getSetting<AISettingsV2>('ai_v2')
    if (v2Settings && v2Settings.version === 2) {
      aiLogger.debug('Loaded AI settings v2')
      // Log Azure config if it exists
      if (v2Settings.providers.azure) {
        aiLogger.debug('Azure config from DB:', {
          resourceName: v2Settings.providers.azure.resourceName,
          useDeploymentBasedUrls: (v2Settings.providers.azure as AzureProviderConfig)
            .useDeploymentBasedUrls,
          baseURL: v2Settings.providers.azure.baseURL
        })
      }
      return v2Settings
    }
  } catch (error) {
    aiLogger.debug('No v2 settings found, checking for v1')
  }

  // Try to get v1 settings and migrate
  try {
    const v1Settings = await getSetting<AISettings>('ai')
    if (v1Settings) {
      aiLogger.info('Found v1 settings, performing migration')
      const v2Settings = migrateAISettingsV1ToV2(v1Settings)

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
    providers: {},
    presets: []
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
 * Get all presets
 */
export async function getAIPresets(): Promise<AIModelPreset[]> {
  const settings = await getAISettingsV2()
  return settings.presets
}

/**
 * Create a new preset
 */
export async function createAIPreset(
  preset: Omit<AIModelPreset, 'id' | 'createdAt'>
): Promise<string> {
  const settings = await getAISettingsV2()

  const newPreset: AIModelPreset = {
    ...preset,
    id: randomUUID(),
    name: preset.name || generatePresetName(preset.provider, preset.model),
    createdAt: new Date().toISOString()
  }

  settings.presets.push(newPreset)
  await saveAISettingsV2(settings)

  aiLogger.info(`Created preset: ${newPreset.name} (${newPreset.id})`)
  return newPreset.id
}

/**
 * Update an existing preset
 */
export async function updateAIPreset(
  presetId: string,
  updates: Partial<Omit<AIModelPreset, 'id' | 'createdAt'>>
): Promise<void> {
  const settings = await getAISettingsV2()

  const presetIndex = settings.presets.findIndex(p => p.id === presetId)
  if (presetIndex === -1) {
    throw new Error(`Preset not found: ${presetId}`)
  }

  const preset = settings.presets[presetIndex]

  // Apply updates
  settings.presets[presetIndex] = {
    ...preset,
    ...updates,
    // Regenerate name if provider or model changed
    name: updates.provider || updates.model
      ? generatePresetName(updates.provider || preset.provider, updates.model || preset.model)
      : updates.name || preset.name
  }

  await saveAISettingsV2(settings)
  aiLogger.info(`Updated preset: ${presetId}`)
}

/**
 * Delete a preset
 */
export async function deleteAIPreset(presetId: string): Promise<void> {
  const settings = await getAISettingsV2()

  const presetIndex = settings.presets.findIndex(p => p.id === presetId)
  if (presetIndex === -1) {
    throw new Error(`Preset not found: ${presetId}`)
  }

  settings.presets.splice(presetIndex, 1)

  // Clear default if it was the deleted preset
  if (settings.defaultPresetId === presetId) {
    settings.defaultPresetId = undefined
  }

  await saveAISettingsV2(settings)
  aiLogger.info(`Deleted preset: ${presetId}`)
}

/**
 * Update provider configuration
 */
export async function updateProviderConfig(
  provider: AIProvider,
  config: AIProviderConfig | AzureProviderConfig
): Promise<void> {
  const settings = await getAISettingsV2()
  settings.providers[provider] = config

  // Log Azure-specific config for debugging
  if (provider === 'azure') {
    aiLogger.debug('Updating Azure provider config:', {
      resourceName: (config as AzureProviderConfig).resourceName,
      useDeploymentBasedUrls: (config as AzureProviderConfig).useDeploymentBasedUrls,
      baseURL: config.baseURL
    })
  }

  await saveAISettingsV2(settings)
  aiLogger.info(`Updated ${provider} provider configuration`)
}

/**
 * Get provider configuration
 */
export async function getProviderConfig(
  provider: AIProvider
): Promise<AIProviderConfig | AzureProviderConfig | undefined> {
  const settings = await getAISettingsV2()
  return settings.providers[provider]
}

// ============================================================================
// V3 Settings Functions
// ============================================================================

/**
 * Get default provider name for migration
 */
function getDefaultProviderName(type: AIProvider): string {
  const names: Record<AIProvider, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    azure: 'Azure OpenAI'
  }
  return names[type]
}

/**
 * Get default models for a provider type (for migration from V2)
 */
function getDefaultModelsForType(type: AIProvider): AIModelDefinition[] {
  const hardcodedModels = FACTORY[type]?.available || []
  return hardcodedModels.map((modelId) => ({
    id: modelId,
    source: 'api' as const, // Treat as API-sourced for migration purposes
    addedAt: new Date().toISOString()
  }))
}

/**
 * Migrate v2 settings to v3 format
 */
export function migrateAISettingsV2ToV3(v2: AISettingsV2): AISettingsV3 {
  aiLogger.info('Migrating AI settings from v2 to v3')

  const v3: AISettingsV3 = {
    version: 3,
    providerConfigs: []
  }

  // Step 1: Convert provider configurations to provider configs
  const providers: AIProvider[] = ['openai', 'anthropic', 'google', 'azure']

  for (const type of providers) {
    const config = v2.providers[type]
    if (!config) continue

    const providerConfigId = randomUUID()
    const now = new Date().toISOString()

    const providerConfig: AIProviderConfiguration = {
      id: providerConfigId,
      name: getDefaultProviderName(type),
      type: type,
      config: config,
      models: getDefaultModelsForType(type), // Migrate from hardcoded list
      modelRefreshEnabled: true,
      enabled: true,
      createdAt: now,
      updatedAt: now
    }

    v3.providerConfigs.push(providerConfig)
    aiLogger.debug(`Migrated ${type} provider configuration to v3`)
  }

  // Step 2: Set default selection from v2.defaultPresetId
  if (v2.defaultPresetId) {
    const defaultPreset = v2.presets.find((p) => p.id === v2.defaultPresetId)
    if (defaultPreset) {
      const matchingConfig = v3.providerConfigs.find((c) => c.type === defaultPreset.provider)
      if (matchingConfig) {
        v3.defaultSelection = {
          providerConfigId: matchingConfig.id,
          modelId: defaultPreset.model
        }
        aiLogger.debug(`Set default selection from v2 preset: ${defaultPreset.name}`)
      }
    }
  }

  aiLogger.info(`Migration complete: ${v3.providerConfigs.length} provider config(s) created`)
  return v3
}

/**
 * Get AI settings v3, performing migration if necessary
 */
export async function getAISettingsV3(): Promise<AISettingsV3> {
  try {
    // Try to get v3 settings first
    const v3Settings = await getSetting<AISettingsV3>('ai_v3')
    if (v3Settings && v3Settings.version === 3) {
      aiLogger.debug('Loaded AI settings v3')
      return v3Settings
    }
  } catch (error) {
    aiLogger.debug('No v3 settings found, checking for v2')
  }

  // Try to get v2 settings and migrate
  try {
    const v2Settings = await getSetting<AISettingsV2>('ai_v2')
    if (v2Settings && v2Settings.version === 2) {
      aiLogger.info('Found v2 settings, performing migration to v3')
      const v3Settings = migrateAISettingsV2ToV3(v2Settings)

      // Save migrated settings
      await setSetting('ai_v3', v3Settings)
      aiLogger.info('Saved migrated v3 settings')

      return v3Settings
    }
  } catch (error) {
    aiLogger.debug('No v2 settings found, checking for v1')
  }

  // Try v1 settings and migrate through v2 first
  try {
    const v1Settings = await getSetting<AISettings>('ai')
    if (v1Settings) {
      aiLogger.info('Found v1 settings, migrating through v2 to v3')
      const v2Settings = migrateAISettingsV1ToV2(v1Settings)
      const v3Settings = migrateAISettingsV2ToV3(v2Settings)

      // Save both v2 and v3 for compatibility
      await setSetting('ai_v2', v2Settings)
      await setSetting('ai_v3', v3Settings)
      aiLogger.info('Saved migrated v2 and v3 settings')

      return v3Settings
    }
  } catch (error) {
    aiLogger.debug('No v1 settings found')
  }

  // Return empty v3 settings if nothing exists
  aiLogger.info('Initializing empty AI settings v3')
  const emptySettings: AISettingsV3 = {
    version: 3,
    providerConfigs: []
  }

  await setSetting('ai_v3', emptySettings)
  return emptySettings
}

/**
 * Save AI settings v3
 */
export async function saveAISettingsV3(settings: AISettingsV3): Promise<void> {
  aiLogger.info('Saving AI settings v3')
  await setSetting('ai_v3', settings)
}

/**
 * Get all provider configurations
 */
export async function getProviderConfigurations(): Promise<AIProviderConfiguration[]> {
  const settings = await getAISettingsV3()
  return settings.providerConfigs
}

/**
 * Get a specific provider configuration by ID
 */
export async function getProviderConfiguration(
  configId: string
): Promise<AIProviderConfiguration | undefined> {
  const settings = await getAISettingsV3()
  return settings.providerConfigs.find((c) => c.id === configId)
}

/**
 * Create a new provider configuration
 */
export async function createProviderConfiguration(
  config: Omit<AIProviderConfiguration, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const settings = await getAISettingsV3()

  const now = new Date().toISOString()
  const newConfig: AIProviderConfiguration = {
    ...config,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now
  }

  settings.providerConfigs.push(newConfig)
  await saveAISettingsV3(settings)

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
  const settings = await getAISettingsV3()

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

  await saveAISettingsV3(settings)
  aiLogger.info(`Updated provider configuration: ${configId}`)
}

/**
 * Delete a provider configuration
 */
export async function deleteProviderConfiguration(configId: string): Promise<void> {
  const settings = await getAISettingsV3()

  const configIndex = settings.providerConfigs.findIndex((c) => c.id === configId)
  if (configIndex === -1) {
    throw new Error(`Provider configuration not found: ${configId}`)
  }

  settings.providerConfigs.splice(configIndex, 1)

  // Clear default selection if it was the deleted config
  if (settings.defaultSelection?.providerConfigId === configId) {
    settings.defaultSelection = undefined
  }

  await saveAISettingsV3(settings)
  aiLogger.info(`Deleted provider configuration: ${configId}`)
}

/**
 * Add a custom model to a provider configuration
 */
export async function addModelToConfiguration(
  configId: string,
  model: Omit<AIModelDefinition, 'source' | 'addedAt'>
): Promise<void> {
  const settings = await getAISettingsV3()

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

  await saveAISettingsV3(settings)
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
  const settings = await getAISettingsV3()

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

  await saveAISettingsV3(settings)
  aiLogger.info(`Updated model ${modelId} in configuration ${configId}`)
}

/**
 * Delete a model from a provider configuration
 */
export async function deleteModelFromConfiguration(
  configId: string,
  modelId: string
): Promise<void> {
  const settings = await getAISettingsV3()

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

  await saveAISettingsV3(settings)
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
        // Return hardcoded list from FACTORY
        const models = FACTORY.anthropic.available
        aiLogger.info(`Using hardcoded Anthropic models (${models.length} models)`)
        return models
      }

      case 'google': {
        // Google Gemini doesn't have a simple model listing API
        // Return hardcoded list from FACTORY
        const models = FACTORY.google.available
        aiLogger.info(`Using hardcoded Google models (${models.length} models)`)
        return models
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
  const settings = await getAISettingsV3()

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

  await saveAISettingsV3(settings)

  aiLogger.info(
    `Model refresh complete: ${newApiModels.length} API models, ${existingCustomModels.length} custom models`
  )

  return config.models
}
