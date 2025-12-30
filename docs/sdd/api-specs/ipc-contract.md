# IPC Contract（プロセス間通信契約）

Releio の 3 プロセス（Main / Backend / Renderer）間の IPC 通信契約を定義する。

---

## IPC アーキテクチャ

```
Renderer <--MessagePort--> Backend
Renderer <--ipcRenderer--> Main
```

**MessagePort**: Renderer ↔ Backend（双方向 RPC + イベント配信）  
**ipcRenderer**: Renderer ↔ Main（従来型 IPC、主に Updater イベント）

---

## RendererBackendAPI（Renderer → Backend）

すべて `Result<T, E>` を返却。

### AI Chat

- `getMastraStatus(): Promise<Result<MastraStatus>>`
- `startMastraSession(resourceId?: string): Promise<Result<{sessionId, threadId, resourceId}>>`
- `streamMastraText(sessionId, messages): Promise<Result<string>>` - streamId 返却
- `abortMastraStream(streamId): Promise<Result<void>>`

### Chat Session

- `createChatSession(request): Promise<Result<string>>` - sessionId
- `getChatSession(sessionId): Promise<Result<ChatSessionWithMessages | null>>`
- `listChatSessions(options?): Promise<Result<ChatSessionRow[]>>`
- `updateChatSession(sessionId, updates): Promise<Result<void>>`
- `deleteChatSession(sessionId): Promise<Result<void>>`
- `searchChatSessions(query): Promise<Result<ChatSessionRow[]>>`
- `addChatMessage(request): Promise<Result<string>>` - messageId
- `deleteMessagesAfter(sessionId, messageId): Promise<Result<void>>`
- `getLastSessionId(): Promise<Result<string | null>>`
- `setLastSessionId(sessionId): Promise<Result<void>>`

### MCP Server

- `listMCPServers(): Promise<Result<MCPServerWithStatus[]>>`
- `addMCPServer(config): Promise<Result<string>>` - serverId
- `updateMCPServer(serverId, updates): Promise<Result<void>>`
- `removeMCPServer(serverId): Promise<Result<void>>`
- `getMCPResources(serverId): Promise<Result<MCPResource[]>>`
- `getMCPTools(serverId): Promise<Result<MCPTool[]>>`
- `getMCPPrompts(serverId): Promise<Result<MCPPrompt[]>>`

### Tool Permission

- `listToolPermissionRules(): Promise<Result<ToolPermissionRule[]>>`
- `createToolPermissionRule(input): Promise<Result<ToolPermissionRule>>`
- `updateToolPermissionRule(id, input): Promise<Result<ToolPermissionRule | null>>`
- `deleteToolPermissionRule(id): Promise<Result<boolean>>`
- `approveToolCall(runId, toolCallId?): Promise<Result<void>>`
- `declineToolCall(runId, toolCallId?, reason?): Promise<Result<void>>`

### Compression

- `getTokenUsage(sessionId, provider, model, additionalInput?): Promise<Result<TokenUsageInfo>>`
- `checkCompressionNeeded(sessionId, provider, model): Promise<Result<boolean>>`
- `getCompressionPreview(sessionId, provider, model, retentionTokens?): Promise<Result<CompressionPreview>>`
- `compressConversation(sessionId, provider, model, apiKey, force?, retentionTokenCount?): Promise<Result<CompressionResult>>`
- `getCompressionSummaries(sessionId): Promise<Result<CompressionSummary[]>>`
- `getCompressionSettings(sessionId): Promise<Result<CompressionSettings>>`
- `setCompressionSettings(sessionId, settings): Promise<Result<void>>`

### Settings

- `getAISettingsV2(): Promise<Result<AISettingsV2>>`
- `saveAISettingsV2(settings): Promise<Result<void>>`
- `getProxySettings(): Promise<Result<ProxySettings>>`
- `setProxySettings(settings): Promise<Result<void>>`
- `getSystemProxySettings(): Promise<Result<ProxySettings>>`
- `getCertificateSettings(): Promise<Result<CertificateSettings>>`
- `setCertificateSettings(settings): Promise<Result<void>>`
- `getSystemCertificateSettings(): Promise<Result<CertificateSettings>>`
- `testProxyConnection(settings): Promise<Result<ConnectionTestResult>>`
- `testCertificateConnection(settings): Promise<Result<ConnectionTestResult>>`
- `testCombinedConnection(proxySettings, certSettings): Promise<Result<ConnectionTestResult>>`
- `testFullConnection(): Promise<Result<ConnectionTestResult>>`

### Provider Configuration

- `getProviderConfigurations(): Promise<Result<AIProviderConfiguration[]>>`
- `createProviderConfiguration(config): Promise<Result<string>>` - configId
- `updateProviderConfiguration(configId, updates): Promise<Result<void>>`
- `deleteProviderConfiguration(configId): Promise<Result<void>>`
- `addModelToConfiguration(configId, model): Promise<Result<void>>`
- `updateModelInConfiguration(configId, modelId, updates): Promise<Result<void>>`
- `deleteModelFromConfiguration(configId, modelId): Promise<Result<void>>`
- `refreshModelsFromAPI(configId): Promise<Result<AIModelDefinition[]>>`

### Utility

- `ping(): Promise<Result<string>>` - "pong"
- `getSetting(key): Promise<Result<unknown>>`
- `setSetting(key, value): Promise<Result<void>>`
- `getAllSettings(): Promise<Result<unknown>>`
- `clearSetting(key): Promise<Result<void>>`
- `getDatabasePath(): Promise<Result<string>>`
- `getLogPath(): Promise<Result<string>>`

---

## Backend → Renderer イベント

### AI Chat

- `mastraChatChunk`: `{ sessionId, streamId, chunk }`
- `mastraChatEnd`: `{ sessionId, streamId, text }`
- `mastraChatError`: `{ sessionId, streamId, error }`
- `mastraChatAborted`: `{ sessionId, streamId }`

### MCP Tool

- `mastraToolCall`: `{ sessionId, streamId, toolCallId, toolName, input }`
- `mastraToolResult`: `{ sessionId, streamId, toolCallId, toolName, output }`
- `toolApprovalRequest` (Phase 3.2): `{ runId, toolCallId, toolName, input, serverId }`

### Compression

- `compressionComplete`: `{ sessionId, summaryId, compressionRatio }`

### MCP Server

- `mcpServerStatusChanged`: `{ serverId, status, error? }`

---

## Main → Renderer イベント（electron-updater）

- `update-available`: `{ version, releaseDate, releaseName?, releaseNotes? }`
- `update-not-available`: `{ version }`
- `update-download-progress`: `{ percent, transferred, total }`
- `update-downloaded`: `{ version, releaseDate }`
- `update-error`: `{ message, code? }`

---

## タイムアウト

- すべての `invoke` 呼び出し: **30秒タイムアウト**（`TimeoutError` 返却）
- イベント配信: タイムアウトなし（Fire-and-Forget）

---

## エラーハンドリング

**Result 型**で成功/失敗を明示。エラー時は `{ status: 'error', error: string }` 返却。

---

## 次のステップ

- tRPC 統合を `api-specs/trpc.md` で定義
- 外部 API 統合を `api-specs/external-integrations.md` で定義
