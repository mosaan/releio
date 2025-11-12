# AI Settings V2 Design Document

## Implementation Status

**Current Status**: ✅ All Phases Complete (100% overall progress)
**Last Updated**: 2025-11-12

| Phase | Status | Commits | Description |
|-------|--------|---------|-------------|
| Phase 1: Backend Schema & Migration | ✅ Complete | 6 commits | V2 interfaces, migration, CRUD, unit tests |
| Phase 2: Model Discovery | ✅ Complete | 1 commit | API discovery for OpenAI/Azure, hardcoded for Anthropic/Google |
| Phase 3: Settings UI Redesign | ✅ Complete | 3 commits | Provider list, edit dialog, model management UI |
| Phase 4: Chat UI Model Selection | ✅ Complete | 2 commits | Dynamic model selector, localStorage persistence, handler integration |
| Phase 5: Testing & Migration | ✅ Complete | 1 commit | Edge case migration tests, 112 backend tests passing |

**Total Commits**: 13 commits
**Test Coverage**: 112 backend tests (17 V2-specific: 6 migration + 11 CRUD/model management)
**Implementation**: Fully backward compatible with V1 (automatic migration)

## Overview

This document describes the AI settings architecture (v2) that addresses limitations in the legacy v1 implementation and supports flexible provider and model management.

## Background: V1 Limitations

The legacy v1 implementation had the following limitations:

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
5. **Backward Compatibility**: Smooth migration from v1 to v2

## Schema Design

### Core Interfaces

```typescript
/**
 * AI Settings V2 - Root configuration object
 */
interface AISettingsV2 {
  version: 2

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

  // Note: Parameters (temperature, maxTokens, etc.) are NOT supported in V2
  // They will use default values from the AI SDK
  // Future enhancement: Add parameter preset support (see Future Enhancements section)
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

## Migration Strategy: V1 → V2

### Automatic Migration on First Launch

```typescript
function migrateAISettingsV2ToV2(v2: AISettingsV2): AISettingsV2 {
  const v2: AISettingsV2 = {
    version: 2,
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

    v2.providerConfigs.push(providerConfig)
  }

  // Step 2: Set default selection from v2.defaultPresetId
  if (v2.defaultPresetId) {
    const defaultPreset = v2.presets.find(p => p.id === v2.defaultPresetId)
    if (defaultPreset) {
      const matchingConfig = v2.providerConfigs.find(c => c.type === defaultPreset.provider)
      if (matchingConfig) {
        v2.defaultSelection = {
          providerConfigId: matchingConfig.id,
          modelId: defaultPreset.model
        }
      }
    }
  }

  return v2
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
- v2 settings stored under `ai_v2` key
- On startup, check for `ai_v2` first, then migrate from `ai_v2` if needed
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
      // Anthropic doesn't have model listing API
      // Return empty array to preserve existing models
      return []

    case 'google':
      // Google Gemini doesn't have a simple model listing API
      // Return empty array to preserve existing models
      return []

    case 'azure':
      // Azure model listing based on deployment
      return await fetchAzureModels(apiKey, baseURL)

    default:
      return []
  }
}
```

### Model Refresh Logic

When refreshing models from API for a provider configuration:

```typescript
async function refreshModelsFromAPI(configId: string): Promise<AIModelDefinition[]> {
  const config = await getProviderConfig(configId)

  // Step 1: Fetch latest models from API
  const apiModelIds = await discoverModels(config.type, config.config.apiKey, config.config.baseURL)

  // Step 2: Replace ALL API-sourced models with fresh list
  const existingCustomModels = config.models.filter(m => m.source === 'custom')
  const newApiModels = apiModelIds.map(id => ({
    id,
    source: 'api' as const,
    isAvailable: true,
    lastChecked: new Date().toISOString(),
    addedAt: new Date().toISOString()
  }))

  // Step 3: Combine: custom models (preserved) + new API models (replaced)
  config.models = [...existingCustomModels, ...newApiModels]
  config.modelLastRefreshed = new Date().toISOString()

  await updateProviderConfig(configId, config)
  return config.models
}
```

**Key Behavior**:
- API-sourced models are **completely replaced** with the latest API response
- Deprecated models naturally disappear (no longer in API response)
- Custom models are **preserved** and unaffected by refresh
- This ensures the model list stays current with provider changes

## UI/UX Changes

### Settings Page Redesign

**Current (v2)**: Tab-based provider configuration + preset list

**New (v2)**: Provider configuration list + model management per config

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

**New (v2)**: Provider + Model selector (shows all available combinations)

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

**Note on Parameters**:
- V2 does not support per-request parameter customization (temperature, maxTokens, etc.)
- All models use default parameters from AI SDK
- See Future Enhancements for planned parameter preset support

## Implementation Phases

### Phase 1: Backend Schema & Migration ✅ COMPLETED
**Status**: Implemented and tested (6 commits: 3eb447d, 8b18ec2, 91f8e7e, d8c91dc, d4251dd, b007caf)

**Completed Tasks**:
- ✅ Define v2 interfaces in `src/common/types.ts` (AISettingsV2, AIProviderConfiguration, AIModelDefinition, AIModelSelection)
- ✅ Implement v1 → v2 migration in `src/backend/settings/ai-settings.ts` with automatic fallback chain (V2→V2→V1)
- ✅ Add v2 CRUD operations for provider configs (create, read, update, delete with UUID/timestamp auto-generation)
- ✅ Add model management APIs (add, update, delete models; refreshModelsFromAPI placeholder)
- ✅ Update Handler layer to expose all V2 APIs
- ✅ Update preload bridge to make V2 APIs accessible from renderer
- ✅ Unit tests added (14 test cases covering migration, CRUD, model management)

**Key Features**:
- Default selection cleanup on config/model deletion
- Duplicate model ID validation
- Auto-generated UUIDs and timestamps
- Type-safe Result<T> pattern throughout

### Phase 2: Model Discovery ✅ COMPLETED
**Status**: Implemented and tested (1 commit: 31aa2ec)

**Completed Tasks**:
- ✅ Implement `discoverModels()` for each provider type:
  - OpenAI: Fetch from `/v1/models` endpoint with proxy/certificate support
  - Anthropic: Return empty array (no API available, preserves existing models)
  - Google: Return empty array (no simple API, preserves existing models)
  - Azure: Fetch from `/v1/models` with `api-key` header
- ✅ Add API client code using `createCustomFetch()` for OpenAI/Azure model listing
- ✅ Add refresh logic with error handling and graceful degradation
- ✅ Handle API unavailability gracefully (return empty array, preserve existing models)
- ✅ Implement model refresh behavior: replace ALL API-sourced models, preserve custom models
- ✅ Update `refreshModelsFromAPI()` with complete implementation

**Key Features**:
- Deprecated models naturally disappear (not in new API response)
- Custom models unaffected by refresh
- `modelLastRefreshed` timestamp tracking
- Comprehensive logging for debugging

### Phase 3: Settings UI Redesign ✅ COMPLETED
**Status**: Implemented and integrated (3 commits: c8547dc, 8c28421, aed73a2)

**Completed Tasks**:
- ✅ Replace tabbed interface with configuration list (AISettingsV2Component)
- ✅ Create provider config edit dialog (ProviderConfigDialog) with full CRUD
- ✅ Implement model management UI:
  - Refresh models from API with visual feedback (success/error states)
  - Add custom models with ID and display name
  - Delete custom models (API models protected)
  - Model list with source indicator (API vs Custom)
- ✅ Add configuration enable/disable toggle per config
- ✅ Integrate V2 UI into Settings page replacing V2

**Components Created**:
1. `AISettingsV2.tsx` (199 lines): Provider configuration list with cards
2. `ProviderConfigDialog.tsx` (498 lines): Full edit/create dialog with model management
3. Shadcn components added: Switch, Badge (Dialog and Select were already available)

**Key Features**:
- Multiple instances of same provider type support
- Default selection badge display
- Enable/disable prevents deletion
- Real-time model count updates
- Azure-specific fields (resource name, deployment URLs toggle)
- Form validation (name and API key required)
- Auto-reload after save

### Phase 4: Chat UI Model Selection ✅ COMPLETE
**Completed in commit 9ec2176** (2025-11-12)

**Implementation Summary**:
- ✅ Created `ModelSelector.tsx` component with provider-grouped dropdown
- ✅ Replaced `PresetSelector` with `ModelSelector` in ChatPage
- ✅ Implemented localStorage persistence for last AIModelSelection (JSON format)
- ✅ Updated `AIRuntimeProvider` to accept `modelSelection` prop instead of `presetId`
- ✅ Updated `streamText()` API to accept `modelSelection` parameter
- ✅ Extended `StreamAIOptions` interface to support both V2 (`modelSelection`) and V2 (`presetId`)
- ✅ Added V2 resolution logic to backend handler with V2 backward compatibility
- ✅ Display model source indicators ("Custom") and default marker ("⭐")
- ✅ Disable providers without API keys
- ✅ Type checking passes (0 errors)

**Files Modified**:
- `src/renderer/src/components/ModelSelector.tsx` (new, 147 lines)
- `src/renderer/src/components/ChatPage.tsx` (model selection + localStorage)
- `src/renderer/src/components/AIRuntimeProvider.tsx` (modelSelection prop)
- `src/renderer/src/lib/ai.ts` (modelSelection parameter)
- `src/common/types.ts` (StreamAIOptions interface)
- `src/backend/handler.ts` (V2 resolution logic)

**Resolution Priority**: V2 modelSelection → V2 presetId → explicit provider/model → default preset → first preset → V1 fallback


### Phase 5: Testing & Migration ✅ COMPLETE
**Completed in commit 7f1ddd6** (2025-11-12)

**Implementation Summary**:
- ✅ V1→V2 migration testing with comprehensive edge cases:
  - Basic migration (2 providers, 1 preset with default)
  - Multiple presets with default selection preservation
  - Azure provider configuration (resourceName, deployment URLs)
  - Custom baseURL in provider config
  - Migration with no default preset
  - Migration with empty presets array
- ✅ Custom model management testing (add, update, delete, duplicate check)
- ✅ Provider configuration CRUD testing (create, read, update, delete)
- ✅ Default selection cleanup testing (when provider/model deleted)
- ⏸️ Model API discovery - Deferred to E2E testing (requires real API calls)
- ⏸️ Chat integration testing - Deferred to E2E testing (requires Electron runtime)

**Test Results**:
- Total: 112 backend tests passing
- V2-specific: 17 tests (6 migration + 11 CRUD/model management)
- Zero failures, all type checks pass

**Files Modified**:
- `tests/backend/ai-settings-v2.test.ts` (+167 lines, 5 new migration tests)

**Next Steps for E2E Testing** (requires executable environment):
- Test model refresh with real OpenAI/Anthropic/Google APIs
- Test chat streaming with V2 model selection
- Test UI workflows (Settings → Model Selector → Chat)
- Verify V1→V2 migration UX in running application

## Deprecation Plan

### V2 Presets
- Presets concept is deprecated in v2
- v2 presets are NOT migrated (information loss acceptable)
- Users will need to re-select their preferred model after migration
- Default selection is set from v2.defaultPresetId if available

### V2 Provider Configs
- Fully migrated to v2 provider configurations
- One v2 provider config → one v2 provider config with default name
- All settings preserved (API key, baseURL, Azure settings)

## Future Enhancements

### Model Parameter Presets (Post V2)
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

## Design Decisions (Resolved)

### 1. Model Alias Support
**Decision**: Not supported in V2
**Rationale**: Adds complexity without clear user benefit. Users can distinguish models by provider config name + model ID.

### 2. Model Deprecation Handling
**Decision**: API-sourced models are completely replaced on refresh
**Behavior**:
- When refreshing from API, all existing API-sourced models are deleted
- New API response becomes the complete list of API-sourced models
- Deprecated models naturally disappear (not in new API response)
- Custom models are preserved and unaffected

### 3. Import/Export Support
**Decision**: Not supported in V2
**Rationale**: Deferred to future enhancement. Focus on core functionality first.

### 4. Model Version Tracking
**Decision**: Not supported in V2
**Rationale**: Use model IDs directly from API as-is. No version management needed since API returns current model IDs.

### 5. Parameter Customization
**Decision**: Not supported in V2
**Rationale**:
- V2's preset-based approach (provider + model + parameters) was overly complex
- V2 focuses on provider config + model selection
- Parameters use AI SDK defaults (temperature, maxTokens, etc.)
- Future enhancement: Parameter presets as separate feature (see Future Enhancements)

### 6. Configuration Templates
**Decision**: Not supported (not planned for future)
**Rationale**:
- Manual configuration provides full flexibility
- Templates would require maintenance as servers/defaults change
- Users can easily configure base URLs manually (single field)
- Focus development effort on core functionality

## Design Finalized

All design decisions have been resolved. The V2 architecture is ready for implementation.

**Key Design Principles**:
1. Multiple provider configurations per type with user-friendly names
2. API-based model discovery with custom model support
3. Dynamic model selection across all enabled configurations
4. Simple, focused scope (no templates, no parameter presets in V2)
5. Smooth migration from V1 with minimal user disruption

## References

- Current v2 implementation: `docs/ISSUE_10_IMPLEMENTATION_PLAN.md`
- OpenAI Models API: https://platform.openai.com/docs/api-reference/models
- AI SDK Provider Documentation: https://ai-sdk.dev/providers/ai-sdk-providers/openai
