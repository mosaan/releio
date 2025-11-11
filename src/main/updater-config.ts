import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readFileSync } from 'fs'
import type { UpdaterConfig } from '@common/types'
import logger from './logger'

/**
 * Load updater configuration from environment variable (dev) or JSON file (production)
 *
 * Development mode:
 *   - Uses ELECTRON_UPDATER_CONFIG environment variable
 *   - Format: JSON string with UpdaterConfig structure
 *   - Example: ELECTRON_UPDATER_CONFIG='{"enabled":true,"updateServerUrl":"http://localhost:5000"}'
 *
 * Production mode:
 *   - Reads from updater.json in the same directory as the executable
 *   - Windows: updater.json should be placed next to the .exe file
 *   - Path: app.getPath('exe') directory / updater.json
 */
export function loadUpdaterConfig(): UpdaterConfig {
  const isDevelopment = process.env.NODE_ENV === 'development'

  if (isDevelopment) {
    return loadFromEnvironment()
  } else {
    return loadFromFile()
  }
}

/**
 * Load configuration from environment variable (development mode)
 */
function loadFromEnvironment(): UpdaterConfig {
  const envConfig = process.env.ELECTRON_UPDATER_CONFIG

  if (!envConfig) {
    logger.info('[UpdaterConfig] No ELECTRON_UPDATER_CONFIG environment variable found')
    return { enabled: false }
  }

  try {
    const config = JSON.parse(envConfig) as UpdaterConfig
    logger.info('[UpdaterConfig] Loaded configuration from environment variable:', config)
    return config
  } catch (error) {
    logger.error('[UpdaterConfig] Failed to parse ELECTRON_UPDATER_CONFIG:', error)
    return { enabled: false }
  }
}

/**
 * Load configuration from JSON file (production mode)
 */
function loadFromFile(): UpdaterConfig {
  try {
    // Get the directory containing the executable
    const exePath = app.getPath('exe')
    const exeDir = dirname(exePath)
    const configPath = join(exeDir, 'updater.json')

    logger.info(`[UpdaterConfig] Looking for updater.json at: ${configPath}`)

    if (!existsSync(configPath)) {
      logger.info('[UpdaterConfig] updater.json not found, auto-update disabled')
      return { enabled: false }
    }

    const configContent = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(configContent) as UpdaterConfig

    logger.info('[UpdaterConfig] Loaded configuration from file:', config)
    return config
  } catch (error) {
    logger.error('[UpdaterConfig] Failed to load updater.json:', error)
    return { enabled: false }
  }
}
