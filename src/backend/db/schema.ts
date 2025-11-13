import { text, sqliteTable, integer } from 'drizzle-orm/sqlite-core'
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm'

// Settings table for app configuration (key-value pairs with JSON values)
export const settings = sqliteTable('settings', {
  key: text('key').notNull().primaryKey(),
  value: text('value', { mode: 'json' }).notNull()
})

// TypeScript types for settings table
export type SelectSetting = InferSelectModel<typeof settings>
export type InsertSetting = InferInsertModel<typeof settings>

// MCP Servers table for Model Context Protocol server configurations
export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  command: text('command').notNull(),
  args: text('args', { mode: 'json' }).notNull().$type<string[]>(),
  env: text('env', { mode: 'json' }).$type<Record<string, string> | null>(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  includeResources: integer('include_resources', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// TypeScript types for mcp_servers table
export type SelectMCPServer = InferSelectModel<typeof mcpServers>
export type InsertMCPServer = InferInsertModel<typeof mcpServers>

// Chat Sessions table for conversation threads
export const chatSessions = sqliteTable('chat_sessions', {
  id: text('id').notNull().primaryKey(),
  title: text('title').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lastMessageAt: integer('last_message_at'),
  archivedAt: integer('archived_at'),
  pinnedAt: integer('pinned_at'),
  providerConfigId: text('provider_config_id'),
  modelId: text('model_id'),
  messageCount: integer('message_count').notNull().default(0),
  dataSchemaVersion: integer('data_schema_version').notNull().default(1),
  summary: text('summary'),
  summaryUpdatedAt: integer('summary_updated_at'),
  color: text('color'),
  metadata: text('metadata')
})

export type SelectChatSession = InferSelectModel<typeof chatSessions>
export type InsertChatSession = InferInsertModel<typeof chatSessions>

// Chat Messages table for conversation turns
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').notNull().primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    state: text('state').notNull().default('completed'),
    sequence: integer('sequence').notNull(),
    createdAt: integer('created_at').notNull(),
    completedAt: integer('completed_at'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    error: text('error'),
    metadata: text('metadata'),
    parentMessageId: text('parent_message_id').references(() => chatMessages.id, {
      onDelete: 'set null'
    }),
    deletedAt: integer('deleted_at')
  },
  (table) => ({
    sessionSequenceIdx: {
      name: 'idx_chat_messages_session_sequence',
      columns: [table.sessionId, table.sequence]
    },
    sessionCreatedIdx: {
      name: 'idx_chat_messages_session_created',
      columns: [table.sessionId, table.createdAt]
    }
  })
)

export type SelectChatMessage = InferSelectModel<typeof chatMessages>
export type InsertChatMessage = InferInsertModel<typeof chatMessages>

// Message Parts table for atomic content blocks
export const messageParts = sqliteTable(
  'message_parts',
  {
    id: text('id').notNull().primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    sequence: integer('sequence').notNull(),
    contentText: text('content_text'),
    contentJson: text('content_json'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    toolCallId: text('tool_call_id'),
    toolName: text('tool_name'),
    status: text('status'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    relatedPartId: text('related_part_id').references(() => messageParts.id, {
      onDelete: 'set null'
    }),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => ({
    messageSequenceIdx: {
      name: 'idx_message_parts_message_sequence',
      columns: [table.messageId, table.sequence]
    },
    sessionKindIdx: {
      name: 'idx_message_parts_session_kind',
      columns: [table.sessionId, table.kind]
    },
    toolCallIdIdx: {
      name: 'idx_message_parts_tool_call_id',
      columns: [table.toolCallId],
      unique: true
    }
  })
)

export type SelectMessagePart = InferSelectModel<typeof messageParts>
export type InsertMessagePart = InferInsertModel<typeof messageParts>

// Tool Invocations table for tool execution lifecycle
export const toolInvocations = sqliteTable(
  'tool_invocations',
  {
    id: text('id').notNull().primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    invocationPartId: text('invocation_part_id')
      .notNull()
      .references(() => messageParts.id, { onDelete: 'cascade' }),
    resultPartId: text('result_part_id').references(() => messageParts.id, {
      onDelete: 'set null'
    }),
    toolCallId: text('tool_call_id').notNull().unique(),
    toolName: text('tool_name').notNull(),
    inputJson: text('input_json'),
    outputJson: text('output_json'),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    latencyMs: integer('latency_ms'),
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => ({
    toolNameIdx: {
      name: 'idx_tool_invocations_tool_name',
      columns: [table.toolName]
    },
    statusCompletedIdx: {
      name: 'idx_tool_invocations_status_completed',
      columns: [table.status, table.completedAt]
    },
    sessionCreatedIdx: {
      name: 'idx_tool_invocations_session_created',
      columns: [table.sessionId, table.createdAt]
    }
  })
)

export type SelectToolInvocation = InferSelectModel<typeof toolInvocations>
export type InsertToolInvocation = InferInsertModel<typeof toolInvocations>

// Session Snapshots table for rolling summaries
export const sessionSnapshots = sqliteTable(
  'session_snapshots',
  {
    id: text('id').notNull().primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    contentJson: text('content_json').notNull(),
    messageCutoffId: text('message_cutoff_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    tokenCount: integer('token_count').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => ({
    sessionKindIdx: {
      name: 'idx_session_snapshots_kind',
      columns: [table.sessionId, table.kind]
    }
  })
)

export type SelectSessionSnapshot = InferSelectModel<typeof sessionSnapshots>
export type InsertSessionSnapshot = InferInsertModel<typeof sessionSnapshots>
