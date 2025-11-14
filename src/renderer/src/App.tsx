import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, MessageCircle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Settings } from '@renderer/components/Settings'
import { ChatPageWithSessions } from '@renderer/components/ChatPageWithSessions'
import { UpdateNotification } from '@renderer/components/UpdateNotification'
import { logger } from '@renderer/lib/logger'
import { isOk } from '@common/result'

function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'settings' | 'chat'>('home')
  const [backendConnected, setBackendConnected] = useState(false)
  const [isCheckingSettings, setIsCheckingSettings] = useState(true)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  useEffect(() => {
    const connectToBackend = async (): Promise<void> => {
      try {
        await window.connectBackend()
        setBackendConnected(true)
        const result = await window.backend.ping()
        if (isOk(result)) {
          logger.info(`Backend ping successful: ${result.value}`)
        }

        // Check AI settings to determine initial page
        const settingsResult = await window.backend.getAISettingsV2()
        if (isOk(settingsResult)) {
          const hasProviderConfigs =
            settingsResult.value?.providerConfigs &&
            settingsResult.value.providerConfigs.length > 0

          if (hasProviderConfigs) {
            // AI is configured, go directly to chat
            logger.info('AI settings found, navigating to chat')
            setCurrentPage('chat')
          } else {
            // No AI configuration, go to settings
            logger.info('No AI settings found, navigating to settings')
            setCurrentPage('settings')
          }
        } else {
          // Failed to get settings, default to settings page
          logger.warn('Failed to get AI settings, navigating to settings')
          setCurrentPage('settings')
        }
      } catch (error) {
        logger.error('Failed to connect to backend:', error)
        setConnectionError(
          error instanceof Error ? error.message : 'Failed to connect to backend'
        )
      } finally {
        setIsCheckingSettings(false)
      }
    }

    connectToBackend()
  }, [])

  // Set up backend exit event listener after connection is established
  useEffect(() => {
    if (!backendConnected) {
      return
    }

    const handleBackendExit = () => {
      logger.error('Backend process exited unexpectedly')
      setBackendConnected(false)
      setConnectionError('Backend process exited unexpectedly. This may be due to a database migration error or other initialization failure.')
    }

    window.backend.onEvent('backendExited', handleBackendExit)

    return () => {
      window.backend.offEvent('backendExited')
    }
  }, [backendConnected])

  const handleSettingsClick = (): void => {
    setCurrentPage('settings')
  }

  const handleChatClick = (): void => {
    setCurrentPage('chat')
  }

  const handleRetryConnection = (): void => {
    setConnectionError(null)
    setIsCheckingSettings(true)
    window.location.reload()
  }

  // Show loading state while checking settings
  if (isCheckingSettings) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-4">
            Loading...
          </div>
          <p className="text-gray-600 dark:text-gray-400">Initializing application</p>
        </div>
      </div>
    )
  }

  // Show error state if backend connection failed
  if (connectionError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-blue-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-600 dark:text-red-400 text-5xl mb-4">⚠️</div>
          <div className="text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-4">
            Connection Failed
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            Failed to connect to the backend process.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-6 font-mono bg-gray-100 dark:bg-gray-800 p-3 rounded">
            {connectionError}
          </p>
          <Button onClick={handleRetryConnection} className="w-full">
            Retry Connection
          </Button>
        </div>
      </div>
    )
  }

  // Ensure backend is connected before showing any content
  if (!backendConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-4">
            Connecting...
          </div>
          <p className="text-gray-600 dark:text-gray-400">Establishing backend connection</p>
        </div>
      </div>
    )
  }

  if (currentPage === 'settings') {
    return <Settings onBack={handleChatClick} />
  }

  if (currentPage === 'chat') {
    return <ChatPageWithSessions onSettings={handleSettingsClick} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-blue-900 relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-400/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-purple-400/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-1000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-pink-400/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Settings button positioned absolutely */}
          <div className="absolute top-8 right-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSettingsClick}
              className="h-9 w-9 backdrop-blur-sm bg-white/10 hover:bg-white/20 transition-all duration-300"
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Hero Section */}
          <div className="text-center pt-16 pb-20">
            <div className="space-y-6">
              <h1 className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">
                Electron AI Starter
              </h1>
              <div className="text-2xl md:text-3xl font-semibold text-gray-700 dark:text-gray-200">
                Stop scaffolding, start building!
              </div>
              <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed">
                Modern desktop apps with TypeScript, React, Sqlite and AI
              </p>
            </div>
          </div>

          {/* Demo Section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-8">
              Explore Template
            </h2>
            <div className="flex flex-wrap justify-center gap-4">
              <Button
                variant="outline"
                onClick={handleChatClick}
                className="flex items-center gap-2 backdrop-blur-sm bg-white/50 hover:bg-white/80 border-2 border-blue-200 hover:border-blue-400 transition-all duration-300"
              >
                <MessageCircle className="h-4 w-4" />
                Chat Demo
              </Button>
              <Button
                variant="outline"
                onClick={handleSettingsClick}
                className="flex items-center gap-2 backdrop-blur-sm bg-white/50 hover:bg-white/80 border-2 border-green-200 hover:border-green-400 transition-all duration-300"
              >
                <SettingsIcon className="h-4 w-4" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Update notification component */}
      <UpdateNotification disabled={!backendConnected} />
    </div>
  )
}

export default App
