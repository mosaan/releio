/**
 * Backend Process Logger
 *
 * This logger sends all logs to the Main Process via IPC for unified logging.
 * All logs are written to a single app.log file by the Main Process.
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug'

interface LogEntry {
  level: LogLevel
  scope: string
  message: string
  data?: unknown
  timestamp: string
}

class BackendLogger {
  private scope: string

  constructor(scope: string = 'backend') {
    this.scope = scope
  }

  /**
   * Send log to Main Process via IPC
   */
  private sendToMain(level: LogLevel, message: string, data?: unknown): void {
    const logEntry: LogEntry = {
      level,
      scope: this.scope,
      message,
      data,
      timestamp: new Date().toISOString()
    }

    // Send to Main Process via IPC (skip in test environment)
    if (process.send && process.env.VITEST !== 'true') {
      process.send({
        type: 'log',
        payload: logEntry
      })
    }

    // Also log to console for development
    if (process.env.NODE_ENV === 'development') {
      const consoleMethod = level === 'debug' ? 'log' : level
      const prefix = `[${this.scope}]`
      if (data) {
        console[consoleMethod](prefix, message, data)
      } else {
        console[consoleMethod](prefix, message)
      }
    }
  }

  error(message: string, data?: unknown): void {
    this.sendToMain('error', message, data)
  }

  warn(message: string, data?: unknown): void {
    this.sendToMain('warn', message, data)
  }

  info(message: string, data?: unknown): void {
    this.sendToMain('info', message, data)
  }

  debug(message: string, data?: unknown): void {
    this.sendToMain('debug', message, data)
  }

  /**
   * Create a child logger with a sub-scope
   */
  child(subScope: string): BackendLogger {
    return new BackendLogger(`${this.scope}:${subScope}`)
  }
}

const logger = new BackendLogger('backend')
export default logger
export { BackendLogger }
