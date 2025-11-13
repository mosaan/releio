// Setup file for renderer tests
// This file runs before all renderer tests

// Mock window.backend API
globalThis.window = {
  backend: {
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
    offEvent: vi.fn()
  },
  connectBackend: vi.fn()
} as any
