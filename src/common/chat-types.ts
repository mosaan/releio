// Database Row Interfaces (Internal, with Unix integer timestamps)

export interface ChatSessionRow {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  lastMessageAt: number | null
  providerConfigId: string | null
  modelId: string | null
  dataSchemaVersion: number
  messageCount: number
  archivedAt: number | null
  pinnedAt: number | null
  summary: string | null
  summaryUpdatedAt: number | null
  color: string | null
  metadata: string | null
}

export interface ChatMessageRow {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  state: 'pending' | 'streaming' | 'completed' | 'error'
  sequence: number
  createdAt: number
  completedAt: number | null
  inputTokens: number | null
  outputTokens: number | null
  error: string | null // JSON string
  metadata: string | null // JSON string
  parentMessageId: string | null
  deletedAt: number | null
}

export interface MessagePartRow {
  id: string
  messageId: string
  sessionId: string
  kind: 'text' | 'tool_invocation' | 'tool_result' | 'attachment' | 'metadata'
  sequence: number
  contentText: string | null
  contentJson: string | null
  mimeType: string | null
  sizeBytes: number | null
  toolCallId: string | null
  toolName: string | null
  status: 'pending' | 'running' | 'success' | 'error' | 'canceled' | null
  errorCode: string | null
  errorMessage: string | null
  relatedPartId: string | null
  metadata: string | null // JSON string
  createdAt: number
  updatedAt: number
}

export interface ToolInvocationRow {
  id: string
  sessionId: string
  messageId: string
  invocationPartId: string
  resultPartId: string | null
  toolCallId: string
  toolName: string
  inputJson: string | null
  outputJson: string | null
  status: 'pending' | 'running' | 'success' | 'error' | 'canceled'
  errorCode: string | null
  errorMessage: string | null
  latencyMs: number | null
  startedAt: number | null
  completedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface SessionSnapshotRow {
  id: string
  sessionId: string
  kind: 'title' | 'summary' | 'memory'
  contentJson: string
  messageCutoffId: string
  tokenCount: number
  createdAt: number
  updatedAt: number
}

// API Interfaces (Returned to Renderer, with ISO 8601 timestamps)

export interface ChatSessionWithMessages {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  lastMessageAt?: string
  providerConfigId?: string | null
  modelId?: string | null
  dataSchemaVersion: number
  messageCount: number
  pinnedAt?: string | null
  archivedAt?: string | null
  summary?: unknown
  summaryUpdatedAt?: string | null
  color?: string | null
  metadata?: unknown
  messages: ChatMessageWithParts[]
  compressionSummaries?: Array<{
    id: string
    content: string
    messageCutoffId: string
    tokenCount: number
    createdAt: string
  }>
}

export interface ChatMessageWithParts {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  state: 'pending' | 'streaming' | 'completed' | 'error'
  sequence: number
  createdAt: string
  completedAt?: string
  inputTokens?: number
  outputTokens?: number
  error?: {
    name: string
    message: string
    details?: unknown
  }
  metadata?: unknown
  parts: MessagePart[]
}

export type MessagePart =
  | TextPart
  | ToolInvocationPart
  | ToolResultPart
  | AttachmentPart
  | MetadataPart

export interface TextPart {
  kind: 'text'
  id: string
  content: string
  createdAt: string
  metadata?: unknown
}

export interface ToolInvocationPart {
  kind: 'tool_invocation'
  id: string
  toolCallId: string
  toolName: string
  input: unknown
  inputText?: string
  status: 'pending' | 'running' | 'success' | 'error' | 'canceled'
  startedAt?: string
  metadata?: unknown
}

export interface ToolResultPart {
  kind: 'tool_result'
  id: string
  relatedToolCallId: string
  output?: unknown
  outputText?: string
  errorCode?: string
  errorMessage?: string
  completedAt?: string
  metadata?: unknown
}

export interface AttachmentPart {
  kind: 'attachment'
  id: string
  mimeType: string
  sizeBytes?: number
  contentUrl?: string
  metadata?: unknown
}

export interface MetadataPart {
  kind: 'metadata'
  id: string
  content: unknown
  metadata?: unknown
}

// Request Interfaces (Passed from Renderer to Backend)

export interface CreateSessionRequest {
  title?: string
  providerConfigId?: string
  modelId?: string
  color?: string
}

export interface AddMessageRequest {
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  parts: AddMessagePartRequest[]
  inputTokens?: number
  outputTokens?: number
  error?: {
    name: string
    message: string
    details?: unknown
  }
  metadata?: unknown
}

export type AddMessagePartRequest =
  | {
      kind: 'text'
      content: string
      metadata?: unknown
    }
  | {
      kind: 'tool_invocation'
      toolCallId: string
      toolName: string
      input: unknown
      inputText?: string
      metadata?: unknown
    }
  | {
      kind: 'attachment'
      mimeType: string
      sizeBytes?: number
      contentJson?: unknown
      metadata?: unknown
    }
  | {
      kind: 'metadata'
      content: unknown
    }
  | {
      kind: 'tool_result'
      toolCallId: string
      output?: unknown
      outputText?: string
      status?: 'success' | 'error' | 'canceled'
      metadata?: unknown
    }

export interface RecordToolInvocationResultRequest {
  toolCallId: string
  status: 'success' | 'error' | 'canceled'
  output?: unknown
  outputText?: string
  errorCode?: string
  errorMessage?: string
  latencyMs?: number
}

export interface ListSessionsOptions {
  limit?: number
  offset?: number
  sortBy?: 'updatedAt' | 'createdAt' | 'title'
  includeArchived?: boolean
}

export interface SessionUpdates {
  title?: string
  providerConfigId?: string | null
  modelId?: string | null
  color?: string | null
}
