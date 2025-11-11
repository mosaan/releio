export type AIProvider = 'openai' | 'anthropic' | 'google' | 'azure'

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIConfig {
  provider: AIProvider
  model: string
  apiKey: string
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

// v2 Settings with multi-preset support
export interface AISettingsV2 {
  version: 2
  defaultPresetId?: string // Last used or user-defined default

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

export interface AIModelPreset {
  id: string // UUID
  name: string // Auto-generated: "{Provider} - {Model}"
  provider: AIProvider
  model: string
  parameters?: {
    temperature?: number
    maxTokens?: number
    topP?: number
    topK?: number
    // Other provider-specific parameters
    [key: string]: unknown
  }
  createdAt: string // ISO 8601
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

export interface RendererBackendAPI {
  ping: () => Promise<Result<string>>
  getSetting: (key: string) => Promise<Result<unknown>>
  setSetting: (key: string, value: unknown) => Promise<Result<void>>
  clearSetting: (key: string) => Promise<Result<void>>
  clearDatabase: () => Promise<Result<void>>
  getDatabasePath: () => Promise<Result<string>>
  getLogPath: () => Promise<Result<string>>
  streamAIText: (messages: AIMessage[]) => Promise<Result<string>>
  abortAIText: (sessionId: string) => Promise<Result<void>>
  getAIModels: (provider: AIProvider) => Promise<Result<string[]>>
  testAIProviderConnection: (config: AIConfig) => Promise<Result<boolean>>
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
