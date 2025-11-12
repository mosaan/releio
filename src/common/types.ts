export type AIProvider = 'openai' | 'anthropic' | 'google' | 'azure'

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Tool call event payloads
export interface ToolCallPayload {
  sessionId: string
  toolCallId: string
  toolName: string
  input: unknown
}

export interface ToolResultPayload {
  sessionId: string
  toolCallId: string
  toolName: string
  output: unknown
}

export interface AIConfig {
  provider: AIProvider
  model: string
  apiKey: string
  baseURL?: string // Custom endpoint (e.g., for OpenAI-compatible APIs)
  resourceName?: string // Azure-specific: resource name
  useDeploymentBasedUrls?: boolean // Azure-specific: use deployment-based URLs
}

// Legacy v1 settings (kept for backward compatibility)
export interface AISettings {
  default_provider?: AIProvider
  openai_api_key?: string
  openai_model?: string
  anthropic_api_key?: string
  anthropic_model?: string
  google_api_key?: string
  google_model?: string
  azure_api_key?: string
  azure_model?: string
}

// Provider-level configuration interfaces (used by both V1 and V2)
export interface AIProviderConfig {
  apiKey: string
  baseURL?: string // Custom endpoint (e.g., for OpenAI-compatible APIs)
  // Provider-specific options stored here
  [key: string]: unknown
}

export interface AzureProviderConfig extends AIProviderConfig {
  resourceName?: string
  useDeploymentBasedUrls?: boolean
}

// v2 Settings with multiple provider configurations
export interface AISettingsV2 {
  version: 2

  // Last used provider config + model combination
  defaultSelection?: {
    providerConfigId: string // References AIProviderConfiguration.id
    modelId: string // References AIModelDefinition.id
  }

  // List of all provider configurations
  providerConfigs: AIProviderConfiguration[]
}

/**
 * Provider Configuration - A specific instance of a provider setup
 * Example: "OpenAI Official", "LocalLM Server", "Azure Production"
 */
export interface AIProviderConfiguration {
  id: string // UUID - unique identifier
  name: string // User-friendly name (e.g., "OpenAI Official", "LocalLM")
  type: AIProvider // Provider type: 'openai' | 'anthropic' | 'google' | 'azure'

  // Connection settings
  config: AIProviderConfig | AzureProviderConfig

  // Model management
  models: AIModelDefinition[] // Available models for this configuration
  modelRefreshEnabled: boolean // Whether to auto-refresh models from API
  modelLastRefreshed?: string // ISO 8601 timestamp of last API fetch

  // Metadata
  enabled: boolean // Whether this config is active
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
}

/**
 * Model Definition - Represents a specific model within a provider config
 */
export interface AIModelDefinition {
  id: string // Model ID used in API calls (e.g., "gpt-4o", "gemini-2.5-flash")
  displayName?: string // Optional custom display name
  source: 'api' | 'custom' // How this model was added

  // Availability tracking (for API-sourced models)
  isAvailable?: boolean // Last known availability status
  lastChecked?: string // ISO 8601 timestamp of last availability check

  // Metadata
  addedAt: string // ISO 8601 - when this model was added
  description?: string // Optional description
}

/**
 * Runtime model selection (used in chat interface)
 */
export interface AIModelSelection {
  providerConfigId: string // Which provider config to use
  modelId: string // Which model from that config
}

export class TimeoutError extends Error {
  limitMs: number

  constructor({ limitMs }: { limitMs: number }) {
    super(`Operation timed out after ${limitMs}ms`)
    this.name = 'TimeoutError'
    this.limitMs = limitMs
  }
}

export type Result<A, E = never> = Ok<A> | Error<E | TimeoutError>

export interface Ok<A> {
  status: 'ok'
  value: A
}

export interface Error<E> {
  status: 'error'
  error: E
}

export interface InvokeMessage {
  id: string
  type: 'invoke'
  channel: string
  args: unknown[]
}

export interface ResultMessage {
  id: string
  type: 'result'
  channel: string
  payload: Result<unknown, unknown>
}

export interface EventMessage {
  type: 'event'
  channel: string
  payload: unknown
}

export type ConnectionMessage = InvokeMessage | ResultMessage | EventMessage

export enum EventType {
  Message = 'message',
  Status = 'status',
  Error = 'error'
}

export interface AppEvent {
  type: EventType
  payload: unknown
}

export interface BackendMainAPI {
  osEncrypt: (text: string) => Promise<Result<string, string>>
  osDecrypt: (text: string) => Promise<Result<string, string>>
}

export interface BackendListenerAPI {
  onEvent: (channel: string, callback: (appEvent: AppEvent) => void) => void
  offEvent: (channel: string) => void
}

// Options for AI text streaming
export interface StreamAIOptions {
  modelSelection?: AIModelSelection  // Use specific model selection (providerConfigId + modelId)
  provider?: AIProvider              // Override provider
  model?: string                     // Override model
  parameters?: Record<string, unknown>  // Override parameters
}

export interface RendererBackendAPI {
  ping: () => Promise<Result<string>>
  getSetting: (key: string) => Promise<Result<unknown>>
  setSetting: (key: string, value: unknown) => Promise<Result<void>>
  clearSetting: (key: string) => Promise<Result<void>>
  getDatabasePath: () => Promise<Result<string>>
  getLogPath: () => Promise<Result<string>>
  streamAIText: (messages: AIMessage[], options?: StreamAIOptions) => Promise<Result<string>>
  abortAIText: (sessionId: string) => Promise<Result<void>>
  getAIModels: (provider: AIProvider) => Promise<Result<string[]>>
  testAIProviderConnection: (config: AIConfig) => Promise<Result<boolean>>
  // AI Settings v2 APIs
  getAISettingsV2: () => Promise<Result<AISettingsV2>>
  saveAISettingsV2: (settings: AISettingsV2) => Promise<Result<void>>
  // Provider Configuration APIs
  getProviderConfigurations: () => Promise<Result<AIProviderConfiguration[]>>
  getProviderConfiguration: (configId: string) => Promise<Result<AIProviderConfiguration | undefined>>
  createProviderConfiguration: (config: Omit<AIProviderConfiguration, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Result<string>>
  updateProviderConfiguration: (configId: string, updates: Partial<Omit<AIProviderConfiguration, 'id' | 'createdAt'>>) => Promise<Result<void>>
  deleteProviderConfiguration: (configId: string) => Promise<Result<void>>
  // Model Management APIs
  addModelToConfiguration: (configId: string, model: Omit<AIModelDefinition, 'source' | 'addedAt'>) => Promise<Result<void>>
  updateModelInConfiguration: (configId: string, modelId: string, updates: Partial<Omit<AIModelDefinition, 'id' | 'source' | 'addedAt'>>) => Promise<Result<void>>
  deleteModelFromConfiguration: (configId: string, modelId: string) => Promise<Result<void>>
  refreshModelsFromAPI: (configId: string) => Promise<Result<AIModelDefinition[]>>
  // MCP Server Management
  listMCPServers: () => Promise<Result<MCPServerWithStatus[]>>
  addMCPServer: (config: Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Result<string>>
  updateMCPServer: (serverId: string, updates: Partial<MCPServerConfig>) => Promise<Result<void>>
  removeMCPServer: (serverId: string) => Promise<Result<void>>
  getMCPResources: (serverId: string) => Promise<Result<MCPResource[]>>
  getMCPTools: (serverId: string) => Promise<Result<MCPTool[]>>
  getMCPPrompts: (serverId: string) => Promise<Result<MCPPrompt[]>>
  callMCPTool: (serverId: string, toolName: string, args: unknown) => Promise<Result<unknown>>
  // Proxy settings
  getProxySettings: () => Promise<Result<ProxySettings>>
  setProxySettings: (settings: ProxySettings) => Promise<Result<void>>
  getSystemProxySettings: () => Promise<Result<ProxySettings>>
  // Certificate settings
  getCertificateSettings: () => Promise<Result<CertificateSettings>>
  setCertificateSettings: (settings: CertificateSettings) => Promise<Result<void>>
  getSystemCertificateSettings: () => Promise<Result<CertificateSettings>>
  // Connection tests
  testProxyConnection: (settings: ProxySettings) => Promise<Result<ConnectionTestResult>>
  testCertificateConnection: (settings: CertificateSettings) => Promise<Result<ConnectionTestResult>>
  testCombinedConnection: (
    proxySettings: ProxySettings,
    certSettings: CertificateSettings
  ) => Promise<Result<ConnectionTestResult>>
  testFullConnection: () => Promise<Result<ConnectionTestResult, string>>
}

export interface RendererMainAPI {
  ping: () => Promise<Result<string>>
  openFolder: (folderPath: string) => Promise<Result<void>>
}

// MCP Server Configuration
export interface MCPServerConfig {
  id: string
  name: string
  description?: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean           // Server will be automatically started when enabled
  includeResources: boolean  // Include resources as tools (default: false)
  createdAt: Date
  updatedAt: Date
}

// MCP Server Status
export interface MCPServerStatus {
  serverId: string
  status: 'connected' | 'stopped' | 'error'
  error?: string
  errorDetails?: string
  updatedAt: string
}

export interface MCPServerWithStatus extends MCPServerConfig {
  runtimeStatus: MCPServerStatus
}

// MCP Resource (read-only data)
export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

// MCP Tool (AI-executable action)
export interface MCPTool {
  name: string
  description?: string
  inputSchema: object  // JSON Schema
}

// MCP Prompt (reusable prompt template)
export interface MCPPrompt {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}

// Proxy and Certificate Types

export type ProxyMode = 'system' | 'custom' | 'none'

export interface ProxySettings {
  mode: ProxyMode
  httpProxy?: string
  httpsProxy?: string
  noProxy?: string[]
  username?: string
  password?: string
}

export type CertificateMode = 'system' | 'custom' | 'none'

export interface CertificateSettings {
  mode: CertificateMode
  customCertificates?: string[]
  rejectUnauthorized?: boolean
}

// Connection Test Types

export interface ConnectionTestResult {
  success: boolean
  message: string
  details?: {
    url?: string
    statusCode?: number
    responseTime?: number
    error?: string
    errorType?: 'proxy' | 'certificate' | 'network' | 'timeout' | 'unknown'
  }
}
