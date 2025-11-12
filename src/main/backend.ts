import { utilityProcess, MessageChannelMain, UtilityProcess, WebContents, app, BrowserWindow } from 'electron'
import logger from './logger'
import { getBasePath } from './paths'
import backendPath from '../backend/index?modulePath'
import log from 'electron-log/main'

export class Backend {
  private _process: UtilityProcess
  private _messageChannels: Map<number, MessageChannelMain> = new Map()
  private _isRunning: boolean = false
  private _hasStopped: boolean = false

  constructor() {
    const userDataPath = getBasePath()
    // Pass app.isPackaged to backend for consistent environment detection
    this._process = utilityProcess.fork(backendPath, [
      '--user-data-path', userDataPath,
      '--is-packaged', app.isPackaged.toString()
    ], {
      stdio: 'pipe' // Enable stdout/stderr capture
    })

    // Setup listener for logs from backend process
    this._setupLogHandler()

    // Setup error and exit handlers
    this._setupProcessMonitoring()
  }

  /**
   * Setup handler to receive logs from backend process
   */
  private _setupLogHandler(): void {
    this._process.on('message', (message) => {
      // Handle log messages from backend
      if (message.type === 'log') {
        const { level, scope, message: logMessage, data } = message.payload

        // Create a scoped logger
        const backendLogger = log.scope(scope || 'backend')

        // Log with appropriate level
        if (data && Object.keys(data).length > 0) {
          backendLogger[level](logMessage, data)
        } else {
          backendLogger[level](logMessage)
        }
      }
    })
  }

  /**
   * Setup monitoring for backend process lifecycle
   */
  private _setupProcessMonitoring(): void {
    // Log when process spawns
    this._process.on('spawn', () => {
      this._isRunning = true
      logger.info('Backend process spawned successfully')
    })

    // Log when process exits
    this._process.on('exit', (code) => {
      this._isRunning = false
      this._hasStopped = true
      logger.error('Backend process exited unexpectedly', { exitCode: code })

      // Notify all renderer windows that backend has exited
      this._notifyBackendExited()
    })

    // Capture stdout
    if (this._process.stdout) {
      this._process.stdout.on('data', (data) => {
        const output = data.toString().trim()
        if (output) {
          logger.info('[backend stdout]', output)
        }
      })
    }

    // Capture stderr - this is critical for debugging crashes
    if (this._process.stderr) {
      this._process.stderr.on('data', (data) => {
        const output = data.toString().trim()
        if (output) {
          logger.error('[backend stderr]', output)
        }
      })
    }
  }

  /**
   * Notify all renderer windows that backend has exited
   */
  private _notifyBackendExited(): void {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send('backendExited')
        logger.info('Sent backendExited notification to renderer', { windowId: window.id })
      }
    })
  }

  connectRenderer(renderer: WebContents): void {
    // Prevent connecting to a dead backend process
    if (this._hasStopped || !this._isRunning) {
      logger.warn('Ignoring connectRenderer request - backend has stopped', {
        rendererId: renderer.id,
        hasStopped: this._hasStopped,
        isRunning: this._isRunning
      })
      return
    }

    const messageChannel = new MessageChannelMain()
    this._messageChannels.set(renderer.id, messageChannel)
    const backendPort = messageChannel.port1
    const rendererPort = messageChannel.port2
    backendPort.start()
    rendererPort.start()

    // send one port to backend tell it it is a connection for renderer
    const message = `renderer/${renderer.id}`
    this._process.postMessage({ channel: 'connectRenderer', message }, [backendPort])

    this._afterRendererConnected(message, () => {
      // send the other port to renderer and inform backend is connected
      renderer.postMessage('backendConnected', null, [rendererPort])
    })
  }

  private _afterRendererConnected(rendererId: string, callback: () => void): void {
    const responseListener = (e) => {
      if (e.data.channel !== 'rendererConnected') return
      if (e.data.message !== rendererId) return

      // Remove listener immediately to prevent accumulation
      this._process.removeListener('message', responseListener)
      callback()
    }

    this._process.on('message', responseListener)
  }

  async stop(): Promise<void> {
    if (!this._process) return

    // If backend already stopped (crashed), no need to wait
    if (this._hasStopped) {
      logger.info('Backend process already stopped (likely crashed)')
      return
    }

    logger.info('Stopping backend process...')

    return new Promise<void>((resolve) => {
      // Set a timeout to prevent infinite waiting
      const timeout = setTimeout(() => {
        logger.warn('Backend process stop timeout - forcing resolution')
        this._hasStopped = true
        resolve()
      }, 5000) // 5 second timeout

      this._process.once('exit', () => {
        clearTimeout(timeout)
        this._hasStopped = true
        logger.info('Backend process stopped')
        resolve()
      })

      // Only kill if the process is still running
      if (this._isRunning) {
        this._process.kill()
      } else {
        // Process not running, resolve immediately
        clearTimeout(timeout)
        logger.info('Backend process not running, skipping kill')
        resolve()
      }
    })
  }
}
