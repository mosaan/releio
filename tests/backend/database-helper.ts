import { drizzle } from 'drizzle-orm/libsql'
import { beforeEach, afterEach } from 'vitest'
import { connectDatabase, runMigrations, setTestDatabase } from '../../src/backend/db/index'

/**
 * Creates a fresh in-memory test database with schema setup
 */
export async function createTestDatabase(): Promise<ReturnType<typeof drizzle>> {
  // Create in-memory libSQL database using the updated connectDatabase function
  const testDb = connectDatabase(':memory:')

  // Run migrations to set up schema (same as production)
  await runMigrations(testDb)

  return testDb
}

/**
 * Vitest fixture for database testing
 * Sets up a fresh in-memory database before each test
 * and injects it into the backend using setTestDatabase()
 */
export function setupDatabaseTest() {
  let testDb: ReturnType<typeof drizzle>

  beforeEach(async () => {
    testDb = await createTestDatabase()
    // Inject the test database into the backend
    setTestDatabase(testDb)
  })

  afterEach(() => {
    // Clean up: close the test database
    if (testDb) {
      testDb.$client.close()
    }
    // Reset to default (will be re-initialized on next use)
    setTestDatabase(null)
  })

  return () => testDb
}
