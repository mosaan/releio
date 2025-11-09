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
