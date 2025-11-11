import { randomUUID } from 'crypto'
import type {
  AISettings,
  AISettingsV2,
  AIProvider,
  AIProviderConfig,
  AzureProviderConfig,
  AIModelPreset
} from '@common/types'
import { getSetting, setSetting } from './index'
import logger from '../logger'
import { FACTORY } from '../ai/factory'

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
