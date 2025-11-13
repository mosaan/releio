// Setup file for renderer tests
// This file runs before all renderer tests
import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Mock electron-log to avoid window.addEventListener issues in happy-dom
vi.mock('electron-log/renderer', () => {
  const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    scope: vi.fn(() => mockLogger)
  }
  return {
    default: mockLogger
  }
})

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.backend API (add to existing window instead of replacing it)
Object.defineProperty(window, 'backend', {
  value: {
    ping: vi.fn(),
    connectBackend: vi.fn(),
    listChatSessions: vi.fn(),
    getChatSession: vi.fn(),
    createChatSession: vi.fn(),
    updateChatSession: vi.fn(),
    deleteChatSession: vi.fn(),
    searchChatSessions: vi.fn(),
    addChatMessage: vi.fn(),
    recordToolInvocationResult: vi.fn(),
    deleteMessagesAfter: vi.fn(),
    getLastSessionId: vi.fn(),
    setLastSessionId: vi.fn(),
    streamAIText: vi.fn(),
    abortAIText: vi.fn(),
    onEvent: vi.fn(),
    offEvent: vi.fn(),
    getAISettingsV2: vi.fn()
  },
  writable: true,
  configurable: true
})

Object.defineProperty(window, 'connectBackend', {
  value: vi.fn().mockResolvedValue(undefined),
  writable: true,
  configurable: true
})
