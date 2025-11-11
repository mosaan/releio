/**
 * Backend Process Logger
 *
 * This logger sends all logs to the Main Process via IPC for unified logging.
 * All logs are written to a single app.log file by the Main Process.
 *
 * For testing: use setTestLogger() to override with a mock implementation.
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug'

interface LogEntry {
  level: LogLevel
  scope: string
  message: string
  data?: unknown
  timestamp: string
}

/**
 * Logger interface for dependency injection
 */
export interface ILogger {
  error(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  debug(message: string, data?: unknown): void
  child(subScope: string): ILogger
}

/**
 * Logger implementation that sends logs to Main Process via IPC
 */
class BackendLogger implements ILogger {
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

    // Send to Main Process via IPC (only in production backend process)
    // Skip in test environment to avoid interference with Vitest's IPC
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST
    const isProductionBackend = typeof process.send === 'function' && !isTestEnv

    if (isProductionBackend && process.send) {
      try {
        process.send({
          type: 'log',
          payload: logEntry
        })
      } catch (error) {
        // Ignore IPC errors
        console.warn('[logger] Failed to send log via IPC:', error)
      }
    }

    // Log to console in development or test environments
    if (process.env.NODE_ENV === 'development' || isTestEnv) {
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

/**
 * Default logger instance
 */
let defaultLogger: ILogger = new BackendLogger('backend')

/**
 * Get the logger instance
 *
 * In production: returns the default BackendLogger
 * In tests: can be overridden with setTestLogger()
 */
export function getLogger(): ILogger {
  return defaultLogger
}

/**
 * Override the logger for testing
 *
 * @param logger - Test logger implementation or null to reset to default
 */
export function setTestLogger(logger: ILogger | null): void {
  if (logger === null) {
    defaultLogger = new BackendLogger('backend')
  } else {
    defaultLogger = logger
  }
}

/**
 * Default export for backward compatibility
 * Use getLogger() for better testability
 */
const logger = getLogger()
export default logger
export { BackendLogger }
