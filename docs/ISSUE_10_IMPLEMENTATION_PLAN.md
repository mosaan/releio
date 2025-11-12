# Issue #10 Implementation Plan: AI Provider Selection and Configuration Flexibility

## Overview

This document outlines the implementation plan for improving AI provider selection and configuration flexibility. The goal is to support multiple provider configurations (presets) and enable users to quickly switch between different AI provider setups.

## Current State Analysis

### Database Schema (v1)
- Simple key-value storage in `settings` table
- AI settings stored under key `'ai'` with type `AISettings`:
  ```typescript
  interface AISettings {
    default_provider?: AIProvider  // 'openai' | 'anthropic' | 'google'
    openai_api_key?: string
    openai_model?: string
    anthropic_api_key?: string
    anthropic_model?: string
    google_api_key?: string
    google_model?: string
  }
  ```

### Supported Providers
- **OpenAI**: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo
- **Anthropic**: Claude 3.5 Sonnet, Haiku, Opus, etc.
- **Google**: Gemini 2.5 Pro, Flash

### AI Streaming API
- `streamAIText(messages)` - Uses current default provider from settings
- `AIConfig` interface: `{ provider, model, apiKey }`
- Factory pattern creates models with custom fetch (proxy/certificate support)

### UI Components
- **Settings.tsx**: Main settings container
- **AISettings.tsx**: Single provider configuration at a time
- **ChatPage.tsx**: Simple chat interface with back button

## Target State

### New Provider Support
Add **Azure OpenAI** as the 4th provider:
- Uses `@ai-sdk/azure` package
- Requires `resourceName`, `apiKey`, and optional `useDeploymentBasedUrls` parameter
- Model deployments configured via baseURL

### Database Schema (v2)

```typescript
interface AISettingsV2 {
  version: 2
  defaultPresetId?: string  // Last used or user-defined default

  // Provider-level configurations
  providers: {
    openai?: AIProviderConfig
    anthropic?: AIProviderConfig
    google?: AIProviderConfig
    azure?: AzureProviderConfig
  }

  // User-defined presets (combinations of provider + model + parameters)
  presets: AIModelPreset[]
}

interface AIProviderConfig {
  apiKey: string
  baseURL?: string  // Custom endpoint (e.g., for OpenAI-compatible APIs)
  // Provider-specific options will be stored here
  [key: string]: unknown
}

interface AzureProviderConfig extends AIProviderConfig {
  resourceName: string
  useDeploymentBasedUrls?: boolean
}

interface AIModelPreset {
  id: string  // UUID
  name: string  // Auto-generated: "{Provider} - {Model}" (e.g., "OpenAI - gpt-4o")
  provider: AIProvider  // 'openai' | 'anthropic' | 'google' | 'azure'
  model: string
  parameters?: {
    temperature?: number
    maxTokens?: number
    topP?: number
    topK?: number
    // Other provider-specific parameters
    [key: string]: unknown
  }
  createdAt: string  // ISO 8601
}

type AIProvider = 'openai' | 'anthropic' | 'google' | 'azure'
```

### Migration Strategy (v1 → v2)

When the application starts, check the `ai` settings:

1. **If v2 exists**: Use it directly
2. **If v1 exists**: Migrate to v2:
   - Create provider configs from `{provider}_api_key`
   - Create a single preset named "Default" from `default_provider` + `{provider}_model`
   - Set `defaultPresetId` to this preset's ID
   - Keep v1 settings for backward compatibility (in case user rolls back)
3. **If no settings exist**: Initialize empty v2 structure

### API Changes

#### Backend API Extensions

```typescript
// Extend streamAIText to accept optional configuration
streamAIText(
  messages: AIMessage[],
  options?: {
    presetId?: string,      // Use specific preset
    provider?: AIProvider,  // Override provider
    model?: string,         // Override model
    parameters?: Record<string, unknown>  // Override parameters
  }
): Promise<Result<string>>

// New APIs for preset management
getAIPresets(): Promise<Result<AIModelPreset[]>>
createAIPreset(preset: Omit<AIModelPreset, 'id' | 'createdAt'>): Promise<Result<string>>
updateAIPreset(presetId: string, updates: Partial<AIModelPreset>): Promise<Result<void>>
deleteAIPreset(presetId: string): Promise<Result<void>>
```

#### Resolution Logic

When `streamAIText` is called:

1. **If `presetId` provided**: Use preset's configuration
2. **Else if `provider`/`model` provided**: Use these overrides with provider's API key
3. **Else if `defaultPresetId` exists**: Use default preset
4. **Else**: Use first available preset with valid API key
5. **Fallback**: Return error "No AI provider configured"

### UI Changes

#### Settings Page Redesign

Use **Tabs** component for provider organization (easier with existing shadcn/ui):

```
┌─────────────────────────────────────┐
│ AI Assistant Configuration          │
├─────────────────────────────────────┤
│ [OpenAI] [Anthropic] [Google] [Azure]│  ← Tabs
│                                      │
│ API Key: [****************] [Test]  │
│ Base URL: [optional]                │
│                                      │
│ Azure-specific:                     │
│ Resource Name: [......]            │
│ ☐ Use deployment-based URLs        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Model Presets                        │
├─────────────────────────────────────┤
│ [+ Create Preset]                   │
│                                      │
│ ┌─────────────────────────────────┐│
│ │ ⭐ OpenAI - gpt-4o      [Edit] │ │ ← Default preset
│ │ Provider: OpenAI                 │ │
│ │ Model: gpt-4o                    │ │
│ │ Temperature: 0.7                 │ │
│ └─────────────────────────────────┘│
│                                      │
│ ┌─────────────────────────────────┐│
│ │ Anthropic - Claude Sonnet [Edit]│ │
│ │ Provider: Anthropic              │ │
│ │ Model: claude-3-5-sonnet...      │ │
│ └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

Features:
- Each tab shows provider-level configuration (API key, baseURL, provider-specific options)
- "Test Connection" button per provider
- Preset management section below (shared across all tabs)
- Create/Edit preset modal with:
  - Provider selection (dropdown, disabled if no API key)
  - Model selection (dropdown from available models)
  - Parameter inputs (temperature, maxTokens, etc.)
  - Auto-generated name: `{Provider} - {Model}`
  - Option to set as default
- Presets show warning icon if provider has no API key

#### Chat Page Enhancement

```
┌─────────────────────────────────────────┐
│ [←Back]  AI Assistant  [OpenAI-gpt4o ▼]│  ← Header with preset selector
├─────────────────────────────────────────┤
│                                          │
│  Chat thread...                          │
│                                          │
└─────────────────────────────────────────┘
```

Dropdown features:
- List all available presets
- Show provider icon + preset name
- Disabled presets (no API key) show tooltip: "Configure API key in Settings"
- "⚙ Edit in Settings" link at bottom
- Store last-used preset ID in localStorage
- Preserve in-progress message when switching presets

## Implementation Phases

### Phase 1: Backend - Database Schema v2 (Commits 1-2)

**Commit 1: Add Azure provider support**
- Update `AIProvider` type in `src/common/types.ts`
- Add Azure factory in `src/backend/ai/factory.ts`
- Install `@ai-sdk/azure` package

**Commit 2: Implement v2 schema and migration**
- Create new interfaces in `src/common/types.ts`:
  - `AISettingsV2`
  - `AIProviderConfig`
  - `AzureProviderConfig`
  - `AIModelPreset`
- Implement migration function in `src/backend/settings/ai-settings.ts`:
  - `migrateAISettingsV1ToV2(v1: AISettings): AISettingsV2`
  - `getAISettingsV2(): Promise<AISettingsV2>`
- Add migration logic to backend initialization

### Phase 2: Backend - Preset-based Streaming API (Commits 3-4)

**Commit 3: Extend streaming API**
- Add optional `options` parameter to `streamAIText` in `src/backend/ai/index.ts`
- Implement resolution logic for preset/provider/model selection
- Update `src/backend/ai/stream.ts` to support new parameters

**Commit 4: Add preset management APIs**
- Implement in `src/backend/settings/ai-settings.ts`:
  - `getAIPresets()`
  - `createAIPreset()`
  - `updateAIPreset()`
  - `deleteAIPreset()`
- Expose via backend IPC in `src/backend/index.ts`
- Update type definitions in `src/common/types.ts` for `RendererBackendAPI`

### Phase 3: Settings UI - Provider Configuration (Commits 5-6)

**Commit 5: Restructure AISettings with Tabs**
- Add `Tabs` component to `src/renderer/src/components/AISettings.tsx`
- Implement provider-specific configuration panels (4 tabs)
- Add baseURL input field
- Add Azure-specific fields (resourceName, useDeploymentBasedUrls)
- Update save/load logic for v2 schema

**Commit 6: Add preset management section**
- Create `AIPresetManager.tsx` component
- Implement preset list view with create/edit/delete/duplicate actions
- Create `AIPresetDialog.tsx` modal for preset creation/editing
- Auto-generate preset names from provider + model
- Add "Set as Default" checkbox

### Phase 4: Chat UI - Preset Selection (Commits 7-8)

**Commit 7: Add preset selector dropdown**
- Update `ChatPage.tsx` header with preset selector
- Create `PresetSelector.tsx` component using shadcn Select
- Implement localStorage persistence for last-used preset
- Handle disabled states for unconfigured providers

**Commit 8: Integrate preset switching with runtime**
- Update `AIRuntimeProvider.tsx` to accept preset context
- Pass preset configuration to streaming API
- Preserve message state during preset switching
- Add "Edit in Settings" shortcut link

### Phase 5: Testing and Documentation (Commits 9-10)

**Commit 9: Add tests and validation**
- Test v1 → v2 migration with various edge cases
- Test preset CRUD operations
- Test resolution logic for preset/provider selection
- Run `pnpm run typecheck` and fix any issues

**Commit 10: Update documentation**
- Update `CLAUDE.md` with new architecture details
- Document v2 schema in detail
- Add troubleshooting guide for migration issues
- Update this progress document with final status

## Progress Tracking

This document will be updated after each phase to track:
- ✅ Completed tasks
- 🚧 In-progress tasks
- ⏳ Pending tasks
- ❌ Blocked/issue tasks

### Current Status

- ✅ Phase 0: Analysis and planning complete
- ✅ Phase 1: Backend - Database Schema v2 (Commits 082be4b, 0dd8851)
- ✅ Phase 2: Backend - Preset-based API (Commit 2b6bd44)
- ✅ Phase 3: Settings UI - Provider Configuration (Commits 032d62f, 89b6bfb, c1b3b0c, dce6bbe, 626a517)
- ✅ Phase 4: Chat UI - Preset Selector (Commit 37d12fc)
- ✅ Phase 5: Bug Fixes and Improvements (Commits 57634b5, fbebd25, 67f94d6, d8b02d7, 800a79e)

**✅ IMPLEMENTATION COMPLETE: V2 Architecture (Provider Configuration-Based)**

The AI Settings V2 architecture has been fully implemented, replacing both the legacy V1 (single provider per type) and an intermediate preset-based approach that was developed but never released.

**V2 Implementation (Current):**
1. Multiple provider configurations per type with user-friendly names (e.g., "OpenAI Official", "LocalLM Server")
2. API-based model discovery with custom model support
3. Dynamic model selection across all enabled configurations
4. Clear distinction between API-sourced and custom models
5. Direct V1→V2 migration with automatic settings preservation

**Architecture Document**: `docs/AI_SETTINGS_V2_DESIGN.md`

**Migration**: The system automatically migrates from V1 (legacy single provider per type) to V2 (provider configuration-based) on first launch. An intermediate preset-based approach was developed during implementation but consolidated into the final V2 release for simplicity.

### Completed Work

#### Phase 1: Backend - Database Schema v2
**Commit 082be4b**: Added Azure OpenAI provider support
- Added 'azure' to AIProvider type
- Installed @ai-sdk/azure package
- Added Azure factory configuration
- Updated UI to include Azure option

**Commit 0dd8851**: Implemented AI settings v2 schema and migration
- Created AISettingsV2, AIProviderConfig, AzureProviderConfig, AIModelPreset interfaces
- Implemented migration function from v1 to v2
- Created ai-settings.ts with preset management functions
- Auto-generated preset names (Provider - Model format)

#### Phase 2: Backend - Preset-based API
**Commit 2b6bd44**: Implemented preset-based AI streaming API
- Added StreamAIOptions interface
- Extended streamAIText with resolution logic (preset → override → default → fallback)
- Added v2 settings management APIs
- Updated Handler and preload bridge with new methods

#### Phase 3: Settings UI - Provider Configuration
**Commit 032d62f**: Added Tabs component and radix-ui dependency
- Installed @radix-ui/react-tabs package
- Created Tabs UI component following shadcn/ui patterns

**Commit 89b6bfb**: Documented UI component selection analysis
- Evaluated 4 options (Radix Tabs, Custom, Accordion, Single Page)
- Documented rationale for choosing Radix UI Tabs
- Detailed accessibility and bundle size considerations

**Commit c1b3b0c**: Restructured AISettings with provider tabs
- Replaced provider/model dropdown with tab-based UI
- Integrated AISettingsV2 API for all operations
- Added baseURL field for OpenAI-compatible APIs
- Added Azure-specific fields (resourceName, useDeploymentBasedUrls)
- Implemented per-provider save, test, and clear functionality
- Display configured presets section at bottom

**Commit dce6bbe**: Replaced custom Tabs with shadcn/ui standard (by user)
- Replaced manually created Tabs component with shadcn/ui standard
- Used `pnpm run shadcn add tabs` for consistency with other components
- Maintains `data-slot` attributes and design patterns
- No functional changes, architectural alignment only

**Commit 626a517**: Added network error handling guidelines
- Updated CLAUDE.md with package installation error handling rules
- Documented requirement to consult user before custom implementations
- Prevents architectural deviations from network errors

#### Phase 4: Chat UI - Preset Selector
**Commit 37d12fc**: Added preset selector to chat interface
- Created PresetSelector component with dropdown UI
- Integrated preset selection into ChatPage header
- Passed presetId through AIRuntimeProvider to streaming logic
- Extended streamText() to accept and pass presetId to backend
- Implemented localStorage persistence for last-used preset
- Display disabled state for unconfigured providers
- Show default preset with star (⭐) icon indicator

#### Phase 5: Bug Fixes and Improvements
**Commit 57634b5**: Fixed baseURL and Azure config not being passed to providers
- Extended AIConfig interface with baseURL, resourceName, useDeploymentBasedUrls
- Modified handler.ts to extract provider configuration and pass to AIConfig
- Updated factory.ts to pass baseURL and Azure settings to SDK constructors
- All providers now properly respect custom baseURL settings

**Commit fbebd25**: Fixed Test Connection to include baseURL and Azure config
- Updated AISettings.tsx testConnection() to include all provider settings in AIConfig
- Ensured Test Connection and chat streaming use identical configuration code path
- Both now share factory.ts createModel() for consistent behavior

**Commit 67f94d6**: Fixed useDeploymentBasedUrls persistence (partial fix)
- Changed from || to ?? operator for boolean handling
- Added debug logging in frontend and backend for config operations

**Commit d8b02d7**: Fixed useDeploymentBasedUrls persistence (root cause)
- Identified JSON.stringify() removes undefined properties
- Fixed loadProviderConfig condition from 'resourceName' in config to provider === 'azure'
- Modified saveProviderConfig to conditionally add optional properties only when they have values
- Ensures boolean fields persist correctly regardless of optional field population

**Commit 800a79e**: Changed to Chat Completion API for OpenAI/Azure compatibility
- Modified OpenAI and Azure providers to use .chat() method instead of default API
- Improves compatibility with OpenAI-compatible servers that only support Chat Completion API
- Documented future enhancement for API mode selection in ISSUE_10_IMPLEMENTATION_PLAN.md

## Technical Decisions

### Why Tabs instead of Accordion?
- Shadcn/ui Tabs component is well-suited for switching between mutually exclusive views
- Better visual separation between providers
- Easier to implement with existing components

### Why Auto-generated Preset Names?
- Reduces cognitive load for users
- Ensures consistency
- Names are descriptive: "OpenAI - gpt-4o", "Anthropic - Claude 3.5 Sonnet"
- Users can still identify presets by provider + model combination

### Why Store baseURL at Provider Level?
- baseURL typically applies to all models from a provider
- Reduces redundancy across presets
- Supports OpenAI-compatible APIs (e.g., local LLMs, Azure OpenAI)

### Why Keep v1 Settings?
- Allows rollback if user encounters issues
- Minimal storage cost (few KB)
- Can be removed in future major version

## Risks and Mitigation

### Risk: Migration Fails for Edge Cases
**Mitigation**:
- Implement comprehensive error handling
- Fall back to empty v2 if migration fails
- Log migration errors for debugging

### Risk: Complex UI Overwhelms Users
**Mitigation**:
- Start with simple 1-provider, 1-preset setup by default
- Progressive disclosure: advanced options hidden initially
- Clear help text and tooltips

### Risk: Breaking Changes for Existing Users
**Mitigation**:
- Automatic v1 → v2 migration on startup
- Preserve existing default provider as "Default" preset
- No user action required for basic functionality

## Future Enhancements (Out of Scope)

- **API Mode Selection for OpenAI-compatible Servers**:
  - Current implementation uses Chat Completion API (`.chat()`) by default for better compatibility with OpenAI-compatible servers
  - Many third-party OpenAI-compatible servers only support Chat Completion API, not the newer Response API
  - Future enhancement: Add UI option to select between Chat Completion API and Response API per provider
  - This would allow users to leverage Response API features (streaming improvements, better error handling) when the server supports it
  - Reference: https://ai-sdk.dev/providers/ai-sdk-providers/openai#chat-models

- Custom provider plugins
- Preset import/export
- Preset sharing via cloud sync
- Advanced parameter presets (system prompts, stop sequences, etc.)
- Provider usage analytics
