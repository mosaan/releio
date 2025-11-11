/**
 * Test Logger Helper
 *
 * Provides mock logger implementations for testing
 */

import { vi } from 'vitest'

/**
 * Logger interface for testing
 */
interface ILogger {
  error: (...args: any[]) => void
  warn: (...args: any[]) => void
  info: (...args: any[]) => void
  debug: (...args: any[]) => void
  child: (scope: string) => ILogger
}

/**
 * Create a mock logger for testing
 *
 * Returns a logger that captures all log calls as vi.fn() mocks
 * without actually performing any logging.
 */
export function createMockLogger(scope: string = 'test'): ILogger {
  const mockLogger: ILogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: vi.fn((subScope: string) => createMockLogger(`${scope}:${subScope}`))
  }
  return mockLogger
}

/**
 * Create a silent logger for testing
 *
 * Returns a logger that does nothing. Useful when you don't need
 * to verify log calls.
 */
export function createSilentLogger(): ILogger {
  const silentLogger: ILogger = {
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
    child: () => silentLogger
  }
  return silentLogger
}
