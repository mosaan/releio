import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import semver from 'semver'
import logger from './logger'
import type {
  UpdaterConfig,
  UpdateInfo,
  UpdateCheckResult,
  UpdateProgressInfo,
  UpdateError
} from '@common/types'

export class Updater {
  private _mainWindow: BrowserWindow | null = null
  private _isUpdateAvailable = false
  private _updateInfo: UpdateInfo | null = null
  private _isDownloading = false
  private _config: UpdaterConfig | null = null
  private _isQuittingToInstall = false

  constructor() {
    // Configure electron-updater logger
    autoUpdater.logger = logger
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    this._setupEventHandlers()
  }

  /**
   * Check if the updater is currently quitting to install an update
   */
  public isQuittingToInstall(): boolean {
    return this._isQuittingToInstall
  }

  /**
   * Initialize updater with configuration and main window reference
   */
  public initialize(config: UpdaterConfig, mainWindow: BrowserWindow): void {
    this._config = config
    this._mainWindow = mainWindow

    if (!config.enabled) {
      logger.info('[Updater] Auto-update is disabled')
      return
    }

    // Skip update checks in development
    if (process.env.NODE_ENV === 'development') {
      logger.info('[Updater] Skipping update check in development mode')
      return
    }

    // Configure update server URL if provided
    if (config.updateServerUrl) {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: config.updateServerUrl,
        channel: config.channel || 'latest'
      })
      logger.info(`[Updater] Update server URL set to: ${config.updateServerUrl}`)
    }

    // Check for updates on app startup (non-blocking)
    this._checkForUpdatesOnStartup()
  }

  /**
   * Manually check for updates
   */
  public async checkForUpdates(): Promise<UpdateCheckResult> {
    if (!this._config?.enabled) {
      throw new Error('Auto-update is disabled')
    }

    if (process.env.NODE_ENV === 'development') {
      throw new Error('Update check is not available in development mode')
    }

    try {
      logger.info('[Updater] Checking for updates...')
      const result = await autoUpdater.checkForUpdates()

      if (!result || !result.updateInfo) {
        return { available: false }
      }

      const currentVersion = app.getVersion()
      const latestVersion = result.updateInfo.version

      if (this._compareVersions(latestVersion, currentVersion) > 0) {
        this._isUpdateAvailable = true
        this._updateInfo = {
          version: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate,
          releaseName: result.updateInfo.releaseName || undefined,
          releaseNotes: result.updateInfo.releaseNotes ? String(result.updateInfo.releaseNotes) : undefined
        }

        logger.info(`[Updater] Update available: ${latestVersion} (current: ${currentVersion})`)
        return {
          available: true,
          updateInfo: this._updateInfo
        }
      } else {
        logger.info(`[Updater] No update available (current: ${currentVersion})`)
        return { available: false }
      }
    } catch (error) {
      logger.error('[Updater] Failed to check for updates:', error)
      throw error
    }
  }

  /**
   * Download the available update
   */
  public async downloadUpdate(): Promise<void> {
    if (!this._isUpdateAvailable) {
      throw new Error('No update available to download')
    }

    if (this._isDownloading) {
      throw new Error('Update is already being downloaded')
    }

    try {
      this._isDownloading = true
      logger.info('[Updater] Starting update download...')
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this._isDownloading = false
      logger.error('[Updater] Failed to download update:', error)
      throw error
    }
  }

  /**
   * Quit the application and install the downloaded update
   */
  public quitAndInstall(): void {
    if (!this._isUpdateAvailable) {
      throw new Error('No update available to install')
    }

    logger.info('[Updater] Quitting and installing update...')
    // Set flag to prevent before-quit handler from interfering
    this._isQuittingToInstall = true

    // setImmediate ensures all pending operations complete before quit
    setImmediate(() => {
      // Remove event listeners to prevent interference with installer launch
      app.removeAllListeners('window-all-closed')
      app.removeAllListeners('before-quit')
      if (this._mainWindow) {
        this._mainWindow.removeAllListeners('close')
        this._mainWindow.close()
      }
      autoUpdater.quitAndInstall(false, true)
    })
  }

  /**
   * Check for updates on app startup (non-blocking background operation)
   */
  private _checkForUpdatesOnStartup(): void {
    // Delay initial check to avoid blocking app startup
    setTimeout(async () => {
      try {
        await this.checkForUpdates()
      } catch (error) {
        // Silent failure - just log the error
        logger.error('[Updater] Background update check failed:', error)
      }
    }, 3000) // 3 second delay
  }

  /**
   * Setup event handlers for electron-updater events
   */
  private _setupEventHandlers(): void {
    autoUpdater.on('checking-for-update', () => {
      logger.info('[Updater] Checking for update...')
    })

    autoUpdater.on('update-available', (info) => {
      logger.info('[Updater] Update available:', info.version)
      this._sendToRenderer('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseName: info.releaseName,
        releaseNotes: info.releaseNotes
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      logger.info('[Updater] Update not available:', info.version)
      this._sendToRenderer('update-not-available', { version: info.version })
    })

    autoUpdater.on('download-progress', (progressInfo: UpdateProgressInfo) => {
      logger.info(
        `[Updater] Download progress: ${progressInfo.percent.toFixed(2)}% (${progressInfo.transferred}/${progressInfo.total})`
      )
      this._sendToRenderer('update-download-progress', progressInfo)
    })

    autoUpdater.on('update-downloaded', (info) => {
      logger.info('[Updater] Update downloaded:', info.version)
      this._isDownloading = false
      this._sendToRenderer('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseName: info.releaseName,
        releaseNotes: info.releaseNotes
      })
    })

    autoUpdater.on('error', (error: Error) => {
      logger.error('[Updater] Error:', error)
      this._isDownloading = false
      const updateError: UpdateError = {
        message: error.message,
        code: (error as any).code
      }
      this._sendToRenderer('update-error', updateError)
    })
  }

  /**
   * Send event to renderer process
   */
  private _sendToRenderer(channel: string, data: unknown): void {
    if (this._mainWindow && !this._mainWindow.isDestroyed()) {
      this._mainWindow.webContents.send(channel, data)
    }
  }

  /**
   * Compare version strings using semver
   * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   * Properly handles prerelease identifiers (e.g., "1.0.0-beta.1")
   */
  private _compareVersions(v1: string, v2: string): number {
    try {
      // Use semver.compare which returns 0 if equal, 1 if v1 > v2, -1 if v1 < v2
      const result = semver.compare(v1, v2)
      return result
    } catch (error) {
      // Fallback to string comparison if semver parsing fails
      logger.warn('[Updater] Failed to parse versions with semver, falling back to string comparison')
      if (v1 > v2) return 1
      if (v1 < v2) return -1
      return 0
    }
  }
}
