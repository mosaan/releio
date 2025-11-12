import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createClient } from '@libsql/client'
import * as path from 'path'
import * as fs from 'fs'
import { sql } from 'drizzle-orm'
import logger from '../logger'
import { getDatabasePath } from '../paths'

interface MigrationStatus {
  appliedCount: number
  pendingCount: number
  latestApplied: string | null
  totalMigrations: number
}

export function connectDatabase(): ReturnType<typeof drizzle> {
  const dbPath = getDatabasePath()

  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const client = createClient({ url: `file:${dbPath}` })
  return drizzle({ client })
}

export async function ensureConnection(database: ReturnType<typeof drizzle>) {
  const result = await database.get(sql`SELECT 1 as test`)
  const test = (result as { test: number }).test
  if (test !== 1) throw new Error('Unable to query database')
}

export async function runMigrations(database: ReturnType<typeof drizzle>): Promise<void> {
  const migrationsFolder = _getMigrationsFolder()
  if (!migrationsFolder) {
    const errorMsg = `Migrations folder not found. CWD: ${process.cwd()}, NODE_ENV: ${process.env.NODE_ENV}`
    logger.error(errorMsg)
    throw new Error(errorMsg)
  }

  const migrationStatus = await _getMigrationStatus(database, migrationsFolder)
  if (migrationStatus.pendingCount === 0) logger.info('DB migration up to date')
  else logger.info(`${migrationStatus.pendingCount} pending db migration(s) to apply`)

  // Run migrations directly - libsql migrate handles checking if already applied
  try {
    await migrate(database, { migrationsFolder })
    logger.info(`DB migration completed`)
  } catch (error) {
    logger.error('DB migration failed', error)
    throw error
  }
}

export function close(db: ReturnType<typeof drizzle>): void {
  db?.$client.close()
}

export function destroy(): void {
  const dbPath = getDatabasePath()
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
  }
}

function _getMigrationsFolder(): string | null {
  // Get packaging status from command line argument passed by main process
  // This is more reliable than checking process.resourcesPath which is defined
  // even in development mode (pointing to Electron's internal resources)
  const args = process.argv
  const isPackagedIndex = args.indexOf('--is-packaged')
  const isPackaged = isPackagedIndex !== -1 && isPackagedIndex + 1 < args.length
    ? args[isPackagedIndex + 1] === 'true'
    : false

  const migrationsPath = isPackaged
    ? path.join(process.resourcesPath!, 'db', 'migrations')
    : path.join(process.cwd(), 'resources', 'db', 'migrations')

  logger.debug('Checking migrations folder', {
    isPackaged,
    migrationsPath,
    exists: fs.existsSync(migrationsPath)
  })

  return fs.existsSync(migrationsPath) ? migrationsPath : null
}

async function _getMigrationStatus(
  database: ReturnType<typeof drizzle>,
  migrationsFolder: string
): Promise<MigrationStatus> {
  // Get all migration files from filesystem
  const migrationFiles = fs
    .readdirSync(migrationsFolder)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  const totalMigrations = migrationFiles.length

  // Try to query the migrations table to see what's been applied
  let appliedMigrations: { id: number; hash: string; created_at: number }[] = []
  try {
    const result = await database.all(sql`SELECT * FROM __drizzle_migrations ORDER BY id`)
    appliedMigrations = result as { id: number; hash: string; created_at: number }[]
  } catch {
    // Table doesn't exist yet, no migrations applied
    appliedMigrations = []
  }

  const appliedCount = appliedMigrations.length
  const pendingCount = Math.max(0, totalMigrations - appliedCount)

  // Get the latest applied migration file name
  let latestApplied: string | null = null
  if (appliedCount > 0 && migrationFiles.length > 0) {
    // The latest applied migration corresponds to the file at index (appliedCount - 1)
    latestApplied = appliedCount <= migrationFiles.length ? migrationFiles[appliedCount - 1] : null
  }

  return {
    appliedCount,
    pendingCount,
    latestApplied,
    totalMigrations
  }
}

export const db = connectDatabase()
