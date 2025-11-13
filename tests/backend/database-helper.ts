import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { beforeEach } from 'vitest'

/**
 * Creates a fresh in-memory test database with schema setup
 */
export async function createTestDatabase(): Promise<ReturnType<typeof drizzle>> {
  // Create in-memory libSQL database
  const client = createClient({ url: ':memory:' })

  // Create tables directly using the libSQL client
  await client.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      "key" TEXT PRIMARY KEY NOT NULL,
      "value" TEXT NOT NULL
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      command TEXT NOT NULL,
      args TEXT NOT NULL,
      env TEXT,
      enabled INTEGER DEFAULT 1 NOT NULL,
      include_resources INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Create Drizzle instance after tables are created
  const testDb = drizzle({ client })

  return testDb
}

/**
 * Creates a fresh in-memory test database with chat session tables
 */
export async function createTestDatabaseWithChatTables(): Promise<ReturnType<typeof drizzle>> {
  // Create base database
  const testDb = await createTestDatabase()
  const client = testDb.$client

  // Enable foreign keys
  await client.execute('PRAGMA foreign_keys = ON')

  // Create chat_sessions table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_message_at INTEGER,
      archived_at INTEGER,
      pinned_at INTEGER,
      provider_config_id TEXT,
      model_id TEXT,
      message_count INTEGER DEFAULT 0 NOT NULL,
      data_schema_version INTEGER DEFAULT 1 NOT NULL,
      summary TEXT,
      summary_updated_at INTEGER,
      color TEXT,
      metadata TEXT
    )
  `)

  // Create chat_messages table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      state TEXT DEFAULT 'completed' NOT NULL,
      sequence INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      error TEXT,
      metadata TEXT,
      parent_message_id TEXT,
      deleted_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL
    )
  `)

  // Create message_parts table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS message_parts (
      id TEXT PRIMARY KEY NOT NULL,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      content_text TEXT,
      content_json TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      tool_call_id TEXT,
      tool_name TEXT,
      status TEXT,
      error_code TEXT,
      error_message TEXT,
      related_part_id TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (related_part_id) REFERENCES message_parts(id) ON DELETE SET NULL
    )
  `)

  // Create tool_invocations table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS tool_invocations (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      invocation_part_id TEXT NOT NULL,
      result_part_id TEXT,
      tool_call_id TEXT NOT NULL UNIQUE,
      tool_name TEXT NOT NULL,
      input_json TEXT,
      output_json TEXT,
      status TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      latency_ms INTEGER,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
      FOREIGN KEY (invocation_part_id) REFERENCES message_parts(id) ON DELETE CASCADE,
      FOREIGN KEY (result_part_id) REFERENCES message_parts(id) ON DELETE SET NULL
    )
  `)

  // Create session_snapshots table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS session_snapshots (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      content_json TEXT NOT NULL,
      message_cutoff_id TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (message_cutoff_id) REFERENCES chat_messages(id) ON DELETE CASCADE
    )
  `)

  return testDb
}

/**
 * Vitest fixture for database testing
 * Sets up a fresh in-memory database before each test
 */
export function setupDatabaseTest() {
  let testDb: ReturnType<typeof drizzle>

  beforeEach(async () => {
    testDb = await createTestDatabase()
  })

  return () => testDb
}
