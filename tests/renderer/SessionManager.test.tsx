import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { SessionManagerProvider, useSessionManager } from '@renderer/contexts/SessionManager'
import { ok } from '@common/result'
import type { ChatSessionRow, ChatSessionWithMessages } from '@common/chat-types'

describe('SessionManager Context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with loading state', async () => {
      window.backend.getLastSessionId = vi.fn().mockResolvedValue(ok(null))
      window.backend.listChatSessions = vi.fn().mockResolvedValue(ok([]))

      const TestComponent = () => {
        const { isLoading, currentSessionId } = useSessionManager()
        return (
          <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'loaded'}</div>
            <div data-testid="session-id">{currentSessionId || 'none'}</div>
          </div>
        )
      }

      render(
        <SessionManagerProvider>
          <TestComponent />
        </SessionManagerProvider>
      )

      // Initially loading
      expect(screen.getByTestId('loading')).toHaveTextContent('loading')

      // After initialization
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })
    })

    it('should load last session on mount', async () => {
      const mockSession: ChatSessionWithMessages = {
        id: 'session-1',
        title: 'Test Session',
        createdAt: '2025-11-13T10:00:00.000Z',
        updatedAt: '2025-11-13T10:00:00.000Z',
        dataSchemaVersion: 1,
        messageCount: 0,
        messages: []
      }

      window.backend.getLastSessionId = vi.fn().mockResolvedValue(ok('session-1'))
      window.backend.getChatSession = vi.fn().mockResolvedValue(ok(mockSession))
      window.backend.listChatSessions = vi.fn().mockResolvedValue(ok([]))

      const TestComponent = () => {
        const { currentSession } = useSessionManager()
        return <div data-testid="title">{currentSession?.title || 'none'}</div>
      }

      render(
        <SessionManagerProvider>
          <TestComponent />
        </SessionManagerProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('title')).toHaveTextContent('Test Session')
      })
      expect(window.backend.getChatSession).toHaveBeenCalledWith('session-1')
    })

    it('should load session list on mount', async () => {
      const mockSessions: ChatSessionRow[] = [
        {
          id: 'session-1',
          title: 'Session 1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastMessageAt: null,
          providerConfigId: null,
          modelId: null,
          dataSchemaVersion: 1,
          messageCount: 0,
          archivedAt: null,
          pinnedAt: null,
          summary: null,
          summaryUpdatedAt: null,
          color: null,
          metadata: null
        }
      ]

      window.backend.getLastSessionId = vi.fn().mockResolvedValue(ok(null))
      window.backend.listChatSessions = vi.fn().mockResolvedValue(ok(mockSessions))

      const TestComponent = () => {
        const { sessions } = useSessionManager()
        return <div data-testid="count">{sessions.length}</div>
      }

      render(
        <SessionManagerProvider>
          <TestComponent />
        </SessionManagerProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('1')
      })
    })
  })

  describe('Session Creation', () => {
    it('should create new session and switch to it', async () => {
      const user = userEvent.setup()
      const mockSession: ChatSessionWithMessages = {
        id: 'new-session',
        title: 'New Chat',
        createdAt: '2025-11-13T10:00:00.000Z',
        updatedAt: '2025-11-13T10:00:00.000Z',
        dataSchemaVersion: 1,
        messageCount: 0,
        messages: []
      }

      window.backend.getLastSessionId = vi.fn().mockResolvedValue(ok(null))
      window.backend.listChatSessions = vi.fn().mockResolvedValue(ok([]))
      window.backend.createChatSession = vi.fn().mockResolvedValue(ok('new-session'))
      window.backend.getChatSession = vi.fn().mockResolvedValue(ok(mockSession))
      window.backend.setLastSessionId = vi.fn().mockResolvedValue(ok(undefined))

      const TestComponent = () => {
        const { createSession, currentSessionId } = useSessionManager()
        return (
          <div>
            <button onClick={() => createSession({ title: 'New Chat' })}>Create</button>
            <div data-testid="session-id">{currentSessionId || 'none'}</div>
          </div>
        )
      }

      render(
        <SessionManagerProvider>
          <TestComponent />
        </SessionManagerProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('session-id')).toHaveTextContent('none')
      })

      const button = screen.getByRole('button', { name: /create/i })
      await user.click(button)

      await waitFor(() => {
        expect(window.backend.createChatSession).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'New Chat' })
        )
        expect(screen.getByTestId('session-id')).toHaveTextContent('new-session')
      })
    })

    it('should include model selection in created session', async () => {
      const user = userEvent.setup()

      window.backend.getLastSessionId = vi.fn().mockResolvedValue(ok(null))
      window.backend.listChatSessions = vi.fn().mockResolvedValue(ok([]))
      window.backend.createChatSession = vi.fn().mockResolvedValue(ok('new-session'))
      window.backend.getChatSession = vi.fn().mockResolvedValue(
        ok({
          id: 'new-session',
          title: 'New Chat',
          createdAt: '2025-11-13T10:00:00.000Z',
          updatedAt: '2025-11-13T10:00:00.000Z',
          dataSchemaVersion: 1,
          messageCount: 0,
          messages: []
        })
      )
      window.backend.setLastSessionId = vi.fn().mockResolvedValue(ok(undefined))

      const TestComponent = () => {
        const { createSession, setModelSelection } = useSessionManager()
        return (
          <div>
            <button
              onClick={() =>
                setModelSelection({
                  providerConfigId: 'provider-1',
                  modelId: 'model-1'
                })
              }
            >
              Set Model
            </button>
            <button onClick={() => createSession({ title: 'New Chat' })}>Create</button>
          </div>
        )
      }

      render(
        <SessionManagerProvider>
          <TestComponent />
        </SessionManagerProvider>
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /set model/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /set model/i }))
      await user.click(screen.getByRole('button', { name: /create/i }))

      await waitFor(() => {
        expect(window.backend.createChatSession).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'New Chat',
            providerConfigId: 'provider-1',
            modelId: 'model-1'
          })
        )
      })
    })
  })

  describe('Session Switching', () => {
    it('should switch to different session', async () => {
      const user = userEvent.setup()
      const mockSession: ChatSessionWithMessages = {
        id: 'session-2',
        title: 'Session 2',
        createdAt: '2025-11-13T10:00:00.000Z',
        updatedAt: '2025-11-13T10:00:00.000Z',
        dataSchemaVersion: 1,
        messageCount: 0,
        messages: []
      }

      window.backend.getLastSessionId = vi.fn().mockResolvedValue(ok(null))
      window.backend.listChatSessions = vi.fn().mockResolvedValue(ok([]))
      window.backend.getChatSession = vi.fn().mockResolvedValue(ok(mockSession))
      window.backend.setLastSessionId = vi.fn().mockResolvedValue(ok(undefined))

      const TestComponent = () => {
        const { switchSession, currentSessionId } = useSessionManager()
        return (
          <div>
            <button onClick={() => switchSession('session-2')}>Switch</button>
            <div data-testid="session-id">{currentSessionId || 'none'}</div>
          </div>
        )
      }

      render(
        <SessionManagerProvider>
          <TestComponent />
        </SessionManagerProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('session-id')).toHaveTextContent('none')
      })

      await user.click(screen.getByRole('button', { name: /switch/i }))

      await waitFor(() => {
        expect(window.backend.setLastSessionId).toHaveBeenCalledWith('session-2')
        expect(screen.getByTestId('session-id')).toHaveTextContent('session-2')
      })
    })

    it('should update model selection from session', async () => {
      const user = userEvent.setup()
      const mockSession: ChatSessionWithMessages = {
        id: 'session-1',
        title: 'Session 1',
        createdAt: '2025-11-13T10:00:00.000Z',
        updatedAt: '2025-11-13T10:00:00.000Z',
        providerConfigId: 'provider-1',
        modelId: 'model-1',
        dataSchemaVersion: 1,
        messageCount: 0,
        messages: []
      }

      window.backend.getLastSessionId = vi.fn().mockResolvedValue(ok(null))
      window.backend.listChatSessions = vi.fn().mockResolvedValue(ok([]))
      window.backend.getChatSession = vi.fn().mockResolvedValue(ok(mockSession))
      window.backend.setLastSessionId = vi.fn().mockResolvedValue(ok(undefined))

      const TestComponent = () => {
        const { switchSession, modelSelection } = useSessionManager()
        return (
          <div>
            <button onClick={() => switchSession('session-1')}>Switch</button>
            <div data-testid="model-id">{modelSelection?.modelId || 'none'}</div>
          </div>
        )
      }

      render(
        <SessionManagerProvider>
          <TestComponent />
        </SessionManagerProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('model-id')).toHaveTextContent('none')
      })

      await user.click(screen.getByRole('button', { name: /switch/i }))

      await waitFor(() => {
        expect(screen.getByTestId('model-id')).toHaveTextContent('model-1')
      })
    })
  })

  describe('Session Updates', () => {
    it('should update session title', async () => {
      const user = userEvent.setup()

      window.backend.getLastSessionId = vi.fn().mockResolvedValue(ok(null))
      window.backend.listChatSessions = vi.fn().mockResolvedValue(ok([]))
      window.backend.updateChatSession = vi.fn().mockResolvedValue(ok(undefined))
      window.backend.getChatSession = vi.fn().mockResolvedValue(
        ok({
          id: 'session-1',
          title: 'Updated Title',
          createdAt: '2025-11-13T10:00:00.000Z',
          updatedAt: '2025-11-13T10:00:00.000Z',
          dataSchemaVersion: 1,
          messageCount: 0,
          messages: []
        })
      )

      const TestComponent = () => {
        const { updateSession } = useSessionManager()
        return (
          <button onClick={() => updateSession('session-1', { title: 'Updated Title' })}>
            Update
          </button>
        )
      }

      render(
        <SessionManagerProvider>
          <TestComponent />
        </SessionManagerProvider>
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /update/i }))

      await waitFor(() => {
        expect(window.backend.updateChatSession).toHaveBeenCalledWith('session-1', {
          title: 'Updated Title'
        })
      })
    })
  })

  describe('Session Deletion', () => {
    it('should delete session', async () => {
      const user = userEvent.setup()

      window.backend.getLastSessionId = vi.fn().mockResolvedValue(ok(null))
      window.backend.listChatSessions = vi.fn().mockResolvedValue(ok([]))
      window.backend.deleteChatSession = vi.fn().mockResolvedValue(ok(undefined))

      const TestComponent = () => {
        const { deleteSession } = useSessionManager()
        return <button onClick={() => deleteSession('session-1')}>Delete</button>
      }

      render(
        <SessionManagerProvider>
          <TestComponent />
        </SessionManagerProvider>
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /delete/i }))

      await waitFor(() => {
        expect(window.backend.deleteChatSession).toHaveBeenCalledWith('session-1')
      })
    })
  })
})
