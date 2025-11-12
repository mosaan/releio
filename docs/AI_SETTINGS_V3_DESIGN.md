# AI Settings V3 Design Document

## Overview

This document describes the redesigned AI settings architecture (v3) that addresses limitations in the current v2 implementation and supports more flexible provider and model management.

## Background: V2 Limitations

The current v2 implementation has the following limitations:

1. **Single Provider Configuration per Type**: Only one configuration allowed per provider type (OpenAI, Anthropic, etc.)
   - Cannot have both "OpenAI Official" and "OpenAI-compatible server" simultaneously
   - Blocks users from managing multiple API endpoints of the same type

2. **Hardcoded Model Lists**: Model names are hardcoded in `factory.ts`
   - No API-based model discovery
   - Cannot add custom models for compatible servers
   - Outdated model lists require code changes

3. **Preset-based Selection**: Chat interface uses presets (provider + model + parameters combination)
   - User expectation: Select from all available models dynamically
   - Current: Select from pre-saved preset combinations

4. **No Model Source Tracking**: Cannot distinguish between:
   - Models discovered via API
   - User-added custom models

## Design Goals

1. **Multiple Configurations per Provider Type**: Users can configure multiple instances of the same provider type with different endpoints
2. **Dynamic Model Management**: Fetch models from API when available, with fallback to custom model lists
3. **Flexible Model Selection**: Chat UI shows all available models across all configured providers
4. **Clear Configuration Identity**: Each provider configuration has a user-friendly name
5. **Backward Compatibility**: Smooth migration from v2 to v3

## Schema Design

### Core Interfaces

```typescript
/**
 * AI Settings V3 - Root configuration object
 */
interface AISettingsV3 {
  version: 3

  // Last used provider config + model combination
  defaultSelection?: {
    providerConfigId: string  // References AIProviderConfiguration.id
    modelId: string            // References AIModelDefinition.id
  }

  // List of all provider configurations
  providerConfigs: AIProviderConfiguration[]
}

/**
 * Provider Configuration - A specific instance of a provider setup
 * Example: "OpenAI Official", "LocalLM Server", "Azure Production"
 */
interface AIProviderConfiguration {
  id: string                   // UUID - unique identifier
  name: string                  // User-friendly name (e.g., "OpenAI Official", "LocalLM")
  type: AIProviderType          // Provider type: 'openai' | 'anthropic' | 'google' | 'azure'

  // Connection settings
  config: AIProviderConfig | AzureProviderConfig

  // Model management
  models: AIModelDefinition[]   // Available models for this configuration
  modelRefreshEnabled: boolean  // Whether to auto-refresh models from API
  modelLastRefreshed?: string   // ISO 8601 timestamp of last API fetch

  // Metadata
  enabled: boolean              // Whether this config is active
  createdAt: string             // ISO 8601
  updatedAt: string             // ISO 8601
}

/**
 * Model Definition - Represents a specific model within a provider config
 */
interface AIModelDefinition {
  id: string                    // Model ID used in API calls (e.g., "gpt-4o", "gemini-2.5-flash")
  displayName?: string          // Optional custom display name
  source: 'api' | 'custom'      // How this model was added

  // Availability tracking (for API-sourced models)
  isAvailable?: boolean         // Last known availability status
  lastChecked?: string          // ISO 8601 timestamp of last availability check

  // Metadata
  addedAt: string               // ISO 8601 - when this model was added
  description?: string          // Optional description
}

/**
 * Provider type enumeration
 */
type AIProviderType = 'openai' | 'anthropic' | 'google' | 'azure'

/**
 * Runtime model selection (used in chat interface)
 */
interface AIModelSelection {
  providerConfigId: string      // Which provider config to use
  modelId: string               // Which model from that config
  parameters?: {                // Optional runtime parameters
    temperature?: number
    maxTokens?: number
    topP?: number
    topK?: number
    [key: string]: unknown
  }
}
```

### Provider Config Structure (AIProviderConfig)

Reuses existing v2 interfaces with no changes needed:

```typescript
interface AIProviderConfig {
  apiKey: string
  baseURL?: string              // Custom endpoint (e.g., for OpenAI-compatible APIs)
  [key: string]: unknown        // Provider-specific options
}

interface AzureProviderConfig extends AIProviderConfig {
  resourceName?: string
  useDeploymentBasedUrls?: boolean
}
```

## Migration Strategy: V2 → V3

### Automatic Migration on First Launch

```typescript
function migrateAISettingsV2ToV3(v2: AISettingsV2): AISettingsV3 {
  const v3: AISettingsV3 = {
    version: 3,
    providerConfigs: []
  }

  // Step 1: Convert provider configurations to provider configs
  for (const [type, config] of Object.entries(v2.providers)) {
    if (!config) continue

    const providerConfigId = randomUUID()
    const providerConfig: AIProviderConfiguration = {
      id: providerConfigId,
      name: getDefaultProviderName(type as AIProviderType),  // "OpenAI", "Anthropic", etc.
      type: type as AIProviderType,
      config: config,
      models: getDefaultModelsForType(type as AIProviderType), // Migrate from hardcoded list
      modelRefreshEnabled: true,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    v3.providerConfigs.push(providerConfig)
  }

  // Step 2: Set default selection from v2.defaultPresetId
  if (v2.defaultPresetId) {
    const defaultPreset = v2.presets.find(p => p.id === v2.defaultPresetId)
    if (defaultPreset) {
      const matchingConfig = v3.providerConfigs.find(c => c.type === defaultPreset.provider)
      if (matchingConfig) {
        v3.defaultSelection = {
          providerConfigId: matchingConfig.id,
          modelId: defaultPreset.model
        }
      }
    }
  }

  return v3
}

function getDefaultModelsForType(type: AIProviderType): AIModelDefinition[] {
  const hardcodedModels = FACTORY[type]?.available || []
  return hardcodedModels.map(modelId => ({
    id: modelId,
    source: 'api' as const,  // Treat as API-sourced for migration purposes
    addedAt: new Date().toISOString()
  }))
}

function getDefaultProviderName(type: AIProviderType): string {
  const names: Record<AIProviderType, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    azure: 'Azure OpenAI'
  }
  return names[type]
}
```

### Migration Behavior

- v2 settings remain in database as `ai_v2` key for rollback capability
- v3 settings stored under `ai_v3` key
- On startup, check for `ai_v3` first, then migrate from `ai_v2` if needed
- Presets from v2 are discarded (users will select provider config + model directly)

## API Layer Changes

### Backend API Extensions

```typescript
// Provider Configuration Management
getProviderConfigs(): Promise<Result<AIProviderConfiguration[]>>
createProviderConfig(config: Omit<AIProviderConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<string>>
updateProviderConfig(configId: string, updates: Partial<AIProviderConfiguration>): Promise<Result<void>>
deleteProviderConfig(configId: string): Promise<Result<void>>

// Model Management
refreshModelsFromAPI(configId: string): Promise<Result<AIModelDefinition[]>>
addCustomModel(configId: string, model: Omit<AIModelDefinition, 'source' | 'addedAt'>): Promise<Result<void>>
updateModel(configId: string, modelId: string, updates: Partial<AIModelDefinition>): Promise<Result<void>>
deleteModel(configId: string, modelId: string): Promise<Result<void>>

// Model Discovery API (new)
discoverModels(providerType: AIProviderType, apiKey: string, baseURL?: string): Promise<Result<string[]>>

// Streaming with Model Selection
streamAIText(
  messages: AIMessage[],
  selection: AIModelSelection  // New: replaces options with StreamAIOptions
): Promise<Result<string>>
```

### Model Discovery Implementation

For providers that support listing models via API:

```typescript
async function discoverModels(
  providerType: AIProviderType,
  apiKey: string,
  baseURL?: string
): Promise<string[]> {
  switch (providerType) {
    case 'openai':
      // Use OpenAI's /v1/models endpoint
      return await fetchOpenAIModels(apiKey, baseURL)

    case 'anthropic':
      // Anthropic doesn't have model listing API - return empty
      return []

    case 'google':
      // Google's model listing API
      return await fetchGoogleModels(apiKey)

    case 'azure':
      // Azure model listing based on deployment
      return await fetchAzureModels(apiKey, baseURL)

    default:
      return []
  }
}
```

## UI/UX Changes

### Settings Page Redesign

**Current (v2)**: Tab-based provider configuration + preset list

**New (v3)**: Provider configuration list + model management per config

```
┌─────────────────────────────────────────────┐
│ AI Provider Configurations                  │
├─────────────────────────────────────────────┤
│ [+ Add New Configuration]                   │
│                                              │
│ ┌─────────────────────────────────────────┐│
│ │ ● OpenAI Official               [Edit] ││
│ │   Type: OpenAI                          ││
│ │   Models: 5 available                   ││
│ │   Status: ✓ Connected                   ││
│ └─────────────────────────────────────────┘│
│                                              │
│ ┌─────────────────────────────────────────┐│
│ │ ● LocalLM Server                [Edit] ││
│ │   Type: OpenAI (compatible)             ││
│ │   Base URL: http://localhost:8000       ││
│ │   Models: 3 available (2 custom)        ││
│ │   Status: ✓ Connected                   ││
│ └─────────────────────────────────────────┘│
│                                              │
│ ┌─────────────────────────────────────────┐│
│ │ ○ Azure Production          [Edit]     ││
│ │   Type: Azure OpenAI    (Disabled)      ││
│ │   Models: 4 available                   ││
│ └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Configuration Edit Dialog**:

```
┌─────────────────────────────────────────────┐
│ Edit Configuration: OpenAI Official         │
├─────────────────────────────────────────────┤
│ Name: [OpenAI Official____________]         │
│ Type: [OpenAI ▼] (read-only after creation)│
│                                              │
│ API Key: [************************] [Test]  │
│ Base URL: [___________________________]     │
│ (Optional - for compatible APIs)             │
│                                              │
│ ┌─────────────────────────────────────────┐│
│ │ Models                                  ││
│ │ [↻ Refresh from API] [+ Add Custom]    ││
│ │                                         ││
│ │ ☑ gpt-4o              (API, 2h ago)    ││
│ │ ☑ gpt-4o-mini         (API, 2h ago)    ││
│ │ ☑ gpt-4-turbo         (API, 2h ago)    ││
│ │ ☑ my-fine-tuned-model (Custom) [×]     ││
│ └─────────────────────────────────────────┘│
│                                              │
│ ☑ Auto-refresh models from API              │
│ ☑ Enable this configuration                 │
│                                              │
│ [Cancel]                    [Save]          │
└─────────────────────────────────────────────┘
```

### Chat Page Model Selection

**Current (v2)**: Preset dropdown (shows preset names)

**New (v3)**: Provider + Model selector (shows all available combinations)

```
┌─────────────────────────────────────────────┐
│ [← Back]  AI Chat                           │
│                                              │
│ Model: [OpenAI Official / gpt-4o        ▼] │
│        └─ Grouped dropdown showing:         │
│           OpenAI Official                   │
│             - gpt-4o                         │
│             - gpt-4o-mini                    │
│             - gpt-4-turbo                    │
│             - my-fine-tuned-model            │
│           LocalLM Server                     │
│             - llama-3-70b                    │
│             - mistral-large                  │
│           Google Gemini                      │
│             - gemini-2.5-pro                 │
│             - gemini-2.5-flash               │
│                                              │
│ [Advanced Parameters ▼]  (Optional)         │
│                                              │
├─────────────────────────────────────────────┤
│  Chat messages...                            │
└─────────────────────────────────────────────┘
```

**Dropdown Implementation**:
- Grouped by provider configuration name
- Show all enabled configurations
- Display model count per configuration
- Gray out unavailable models (if API reported unavailability)
- Persist last selection to localStorage

## Implementation Phases

### Phase 1: Backend Schema & Migration
- Define v3 interfaces in `src/common/types.ts`
- Implement v2 → v3 migration in `src/backend/settings/ai-settings.ts`
- Add v3 CRUD operations for provider configs
- Add model management APIs

### Phase 2: Model Discovery
- Implement `discoverModels()` for each provider type
- Add API client code for OpenAI model listing
- Add refresh logic with error handling
- Handle API unavailability gracefully (fall back to custom models)

### Phase 3: Settings UI Redesign
- Replace tabbed interface with configuration list
- Create provider config edit dialog
- Implement model management UI (refresh, add custom, delete)
- Add configuration enable/disable toggle

### Phase 4: Chat UI Model Selection
- Replace preset selector with grouped provider + model dropdown
- Implement localStorage persistence for last selection
- Update streaming API calls to use AIModelSelection
- Add optional parameters panel (temperature, etc.)

### Phase 5: Testing & Migration
- Test v2 → v3 migration with various scenarios
- Test model API discovery with real endpoints
- Test custom model addition/deletion
- Test chat with different provider configs and models
- Update documentation

## Deprecation Plan

### V2 Presets
- Presets concept is deprecated in v3
- v2 presets are NOT migrated (information loss acceptable)
- Users will need to re-select their preferred model after migration
- Default selection is set from v2.defaultPresetId if available

### V2 Provider Configs
- Fully migrated to v3 provider configurations
- One v2 provider config → one v3 provider config with default name
- All settings preserved (API key, baseURL, Azure settings)

## Future Enhancements

### Model Parameter Presets (Post V3)
- Add ability to save parameter combinations (temperature, maxTokens, etc.)
- Separate from provider + model selection
- Allow quick switching between "Creative", "Balanced", "Precise" presets

### Model Performance Metrics
- Track response time, token usage per model
- Display average metrics in model selection UI
- Help users choose optimal models

### Model Cost Tracking
- Display estimated cost per model
- Track usage and spending per configuration
- Budget alerts and limits

### API Key Rotation
- Support multiple API keys per configuration
- Automatic rotation on rate limit
- Load balancing across keys

## Open Questions

1. **Model Alias Support**: Should users be able to create aliases for models? (e.g., "My Best Model" → "gpt-4o")
2. **Model Deprecation Handling**: How to handle when API stops returning a previously available model?
3. **Configuration Templates**: Should we provide templates for popular compatible servers (Ollama, LM Studio, etc.)?
4. **Import/Export**: Should configurations be exportable/importable for sharing?
5. **Model Version Tracking**: Should we track model versions/snapshots (e.g., gpt-4o-2024-11-20)?

## References

- Current v2 implementation: `docs/ISSUE_10_IMPLEMENTATION_PLAN.md`
- OpenAI Models API: https://platform.openai.com/docs/api-reference/models
- AI SDK Provider Documentation: https://ai-sdk.dev/providers/ai-sdk-providers/openai
