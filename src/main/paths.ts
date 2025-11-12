import { join, resolve } from 'path'
import { app } from 'electron'

export function getBasePath(): string {
  // Use app.isPackaged for reliable production detection
  // When packaged: use Electron's userData directory
  // When not packaged (development): use MAIN_VITE_USER_DATA_PATH
  if (!app.isPackaged) {
    // Development: Use MAIN_VITE_USER_DATA_PATH from .env
    const userDataPath = import.meta.env.MAIN_VITE_USER_DATA_PATH
    if (!userDataPath) {
      throw new Error('MAIN_VITE_USER_DATA_PATH env var is required in development.')
    }
    return userDataPath
  }

  // Production: Always use Electron's userData directory
  return app.getPath('userData')
}

export function getDatabasePath(): string {
  return resolve(join(getBasePath(), 'db', 'app.db'))
}

export function getLogPath(): string {
  return resolve(join(getBasePath(), 'logs'))
}
