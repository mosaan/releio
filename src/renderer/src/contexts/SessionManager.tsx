import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { logger } from '@renderer/lib/logger'
import { isOk } from '@common/result'
import type {
  ChatSessionRow,
  ChatSessionWithMessages,
  CreateSessionRequest,
  SessionUpdates
} from '@common/chat-types'
import type { AIModelSelection, MastraSessionInfo, MastraStatus } from '@common/types'

interface SessionManagerContextValue {
  // Current session state
  currentSessionId: string | null
  currentSession: ChatSessionWithMessages | null
  isLoading: boolean

  // Session list
  sessions: ChatSessionRow[]

  // Session operations
  createSession: (request: CreateSessionRequest) => Promise<string | null>
  switchSession: (sessionId: string) => Promise<void>
  updateSession: (sessionId: string, updates: SessionUpdates) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  refreshSessions: () => Promise<void>
  refreshCurrentSession: () => Promise<void>

  // Model selection for current session
  modelSelection: AIModelSelection | null
  setModelSelection: (selection: AIModelSelection | null) => void

  // Mastra session management
  mastraSessionId: string | null
  mastraStatus: MastraStatus | null
  initializeMastraSession: () => Promise<MastraSessionInfo | null>
}

const SessionManagerContext = createContext<SessionManagerContextValue | undefined>(undefined)

interface SessionManagerProviderProps {
  children: ReactNode
}

export function SessionManagerProvider({
  children
}: SessionManagerProviderProps): React.JSX.Element {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentSession, setCurrentSession] = useState<ChatSessionWithMessages | null>(null)
  const [sessions, setSessions] = useState<ChatSessionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [modelSelection, setModelSelection] = useState<AIModelSelection | null>(null)

  // Mastra session state
  const [mastraSessionId, setMastraSessionId] = useState<string | null>(null)
  const [mastraStatus, setMastraStatus] = useState<MastraStatus | null>(null)

  // Initialize Mastra session
  const initializeMastraSession = useCallback(async (): Promise<MastraSessionInfo | null> => {
    try {
      // First check Mastra status
      const statusResult = await window.backend.getMastraStatus()
      if (isOk(statusResult)) {
        setMastraStatus(statusResult.value)

        if (!statusResult.value.ready) {
          logger.warn('[Mastra] Not ready:', statusResult.value.reason)
          return null
        }
      } else {
        logger.error('[Mastra] Failed to get status')
        return null
      }

      // Start a new Mastra session
      const sessionResult = await window.backend.startMastraSession()
      if (isOk(sessionResult)) {
        const session = sessionResult.value
        setMastraSessionId(session.sessionId)
        logger.info(`[Mastra] Session initialized: ${session.sessionId}`)
        return session
      } else {
        logger.error('[Mastra] Failed to start session:', sessionResult.error)
        return null
      }
    } catch (error) {
      logger.error('[Mastra] Error initializing session:', error)
      return null
    }
  }, [])

  // Load sessions from backend (pure function - no currentSessionId dependency)
  const refreshSessions = useCallback(async () => {
    try {
      const result = await window.backend.listChatSessions({ limit: 100 })
      if (isOk(result)) {
        setSessions(result.value)
      } else {
        logger.error('Failed to load sessions:', result.error)
      }
    } catch (error) {
      logger.error('Error loading sessions:', error)
    }
  }, [])

  // Load current session details
  const loadCurrentSession = useCallback(async (sessionId: string) => {
    try {
      const result = await window.backend.getChatSession(sessionId)
      if (isOk(result)) {
        if (result.value) {
          setCurrentSession(result.value)
          // Update model selection from session
          if (result.value.providerConfigId && result.value.modelId) {
            setModelSelection({
              providerConfigId: result.value.providerConfigId,
              modelId: result.value.modelId
            })
          }
        } else {
          logger.warn(`Session ${sessionId} not found`)
          setCurrentSession(null)
        }
      } else {
        logger.error('Failed to load session:', result.error)
      }
    } catch (error) {
      logger.error('Error loading session:', error)
    }
  }, [])

  // Refresh current session details (messages, compression summaries, etc.)
  const refreshCurrentSession = useCallback(async () => {
    if (currentSessionId) {
      await loadCurrentSession(currentSessionId)
    }
  }, [currentSessionId, loadCurrentSession])

  // Initialize: load last session ID and sessions
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true)
      try {
        await window.connectBackend()

        // Load last session ID
        const lastSessionResult = await window.backend.getLastSessionId()
        if (isOk(lastSessionResult) && lastSessionResult.value) {
          setCurrentSessionId(lastSessionResult.value)
          await loadCurrentSession(lastSessionResult.value)
        }

        // Load session list
        await refreshSessions()
      } catch (error) {
        logger.error('Failed to initialize SessionManager:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initialize()
  }, [])

  // Update current session metadata when sessions list or currentSessionId changes
  useEffect(() => {
    if (!currentSessionId) {
      return
    }

    const updatedSession = sessions.find((s) => s.id === currentSessionId)
    if (!updatedSession) {
      return
    }

    // Update currentSession with latest metadata from sessions list
    setCurrentSession((prevSession) => {
      if (!prevSession) {
        return prevSession
      }

      // Only update if messageCount or updatedAt changed
      if (
        updatedSession.messageCount === prevSession.messageCount &&
        new Date(updatedSession.updatedAt).toISOString() === prevSession.updatedAt
      ) {
        return prevSession
      }

      return {
        ...prevSession,
        messageCount: updatedSession.messageCount,
        updatedAt: new Date(updatedSession.updatedAt).toISOString()
      }
    })
  }, [currentSessionId, sessions])

  // Create new session
  const createSession = useCallback(
    async (request: CreateSessionRequest): Promise<string | null> => {
      try {
        // Add model selection if available
        const fullRequest: CreateSessionRequest = {
          ...request,
          providerConfigId: modelSelection?.providerConfigId,
          modelId: modelSelection?.modelId
        }

        const result = await window.backend.createChatSession(fullRequest)
        if (isOk(result)) {
          const sessionId = result.value
          logger.info(`Created new session: ${sessionId}`)

          // Refresh session list
          await refreshSessions()

          // Switch to new session
          await switchSession(sessionId)

          return sessionId
        } else {
          logger.error('Failed to create session:', result.error)
          return null
        }
      } catch (error) {
        logger.error('Error creating session:', error)
        return null
      }
    },
    [modelSelection, refreshSessions]
  )

  // Switch to different session
  const switchSession = useCallback(
    async (sessionId: string) => {
      try {
        setCurrentSessionId(sessionId)

        // Save last session ID
        await window.backend.setLastSessionId(sessionId)

        // Load session details
        await loadCurrentSession(sessionId)

        logger.info(`Switched to session: ${sessionId}`)
      } catch (error) {
        logger.error('Error switching session:', error)
      }
    },
    [loadCurrentSession]
  )

  // Update session metadata
  const updateSession = useCallback(
    async (sessionId: string, updates: SessionUpdates) => {
      try {
        const result = await window.backend.updateChatSession(sessionId, updates)
        if (isOk(result)) {
          logger.info(`Updated session: ${sessionId}`)

          // Refresh sessions to reflect changes
          await refreshSessions()

          // If updating current session, reload it
          if (sessionId === currentSessionId) {
            await loadCurrentSession(sessionId)
          }
        } else {
          logger.error('Failed to update session:', result.error)
        }
      } catch (error) {
        logger.error('Error updating session:', error)
      }
    },
    [currentSessionId, refreshSessions, loadCurrentSession]
  )

  // Delete session
  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const result = await window.backend.deleteChatSession(sessionId)
        if (isOk(result)) {
          logger.info(`Deleted session: ${sessionId}`)

          // If deleting current session, switch to first available or create new
          if (sessionId === currentSessionId) {
            await refreshSessions()
            const remainingSessions = sessions.filter((s) => s.id !== sessionId)
            if (remainingSessions.length > 0) {
              await switchSession(remainingSessions[0].id)
            } else {
              // No sessions left, create new one
              await createSession({ title: 'New Chat' })
            }
          } else {
            // Just refresh session list
            await refreshSessions()
          }
        } else {
          logger.error('Failed to delete session:', result.error)
        }
      } catch (error) {
        logger.error('Error deleting session:', error)
      }
    },
    [currentSessionId, sessions, refreshSessions, switchSession, createSession]
  )

  const value: SessionManagerContextValue = {
    currentSessionId,
    currentSession,
    isLoading,
    sessions,
    createSession,
    switchSession,
    updateSession,
    deleteSession,
    refreshSessions,
    refreshCurrentSession,
    modelSelection,
    setModelSelection,
    // Mastra session
    mastraSessionId,
    mastraStatus,
    initializeMastraSession
  }

  return <SessionManagerContext.Provider value={value}>{children}</SessionManagerContext.Provider>
}

export function useSessionManager(): SessionManagerContextValue {
  const context = useContext(SessionManagerContext)
  if (context === undefined) {
    throw new Error('useSessionManager must be used within a SessionManagerProvider')
  }
  return context
}
