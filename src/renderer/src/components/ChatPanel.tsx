import { useEffect, useState } from 'react'
import { Settings, AlertCircle, Archive } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Thread } from '@renderer/components/assistant-ui/thread'
import { AIRuntimeProvider } from '@renderer/components/AIRuntimeProvider'
import { ModelSelector } from '@renderer/components/ModelSelector'
import { TokenUsageIndicator } from '@renderer/components/TokenUsageIndicator'
import { CompressionConfirmDialog } from '@renderer/components/CompressionConfirmDialog'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import { useSessionManager } from '@renderer/contexts/SessionManager'
import type { AISettingsV2, AIModelSelection, CompressionResult } from '@common/types'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'

interface ChatPanelProps {
  onSettings: () => void
}

export function ChatPanel({ onSettings }: ChatPanelProps): React.JSX.Element {
  const { currentSession, currentSessionId, modelSelection, setModelSelection, updateSession, refreshSessions, refreshCurrentSession } = useSessionManager()
  const [hasProviderConfigs, setHasProviderConfigs] = useState<boolean>(true)
  const [hasAvailableModels, setHasAvailableModels] = useState<boolean>(true)
  const [compressionNeeded, setCompressionNeeded] = useState<boolean>(false)
  const [showCompressionDialog, setShowCompressionDialog] = useState<boolean>(false)
  const [apiKey, setApiKey] = useState<string>('')

  // Handle model selection change and persist to database
  const handleModelChange = async (newSelection: AIModelSelection | null) => {
    setModelSelection(newSelection)

    // Persist model selection to session if we have a current session
    if (currentSessionId && newSelection) {
      await updateSession(currentSessionId, {
        providerConfigId: newSelection.providerConfigId,
        modelId: newSelection.modelId
      })
    }
  }

  // Check if there are any provider configurations and available models
  useEffect(() => {
    const checkProviderConfigs = async (): Promise<void> => {
      await window.connectBackend()
      const result = await window.backend.getAISettingsV2()
      if (isOk(result)) {
        const settings: AISettingsV2 = result.value
        const hasConfigs = settings?.providerConfigs && settings.providerConfigs.length > 0
        setHasProviderConfigs(hasConfigs)

        // Check if there are any enabled providers with models
        if (hasConfigs) {
          const hasModels = settings.providerConfigs.some(
            (config) => config.enabled && config.models.length > 0
          )
          setHasAvailableModels(hasModels)

          // Validate modelSelection - check if it still exists in available models
          if (modelSelection) {
            const selectedConfig = settings.providerConfigs.find(
              (config) => config.id === modelSelection.providerConfigId
            )
            const modelExists =
              selectedConfig &&
              selectedConfig.enabled &&
              selectedConfig.models.some((model) => model.id === modelSelection.modelId)

            if (!modelExists) {
              // Selected model is no longer available, reset to null
              setModelSelection(null)
            }
          }
        } else {
          setHasAvailableModels(false)
        }
      }
    }
    checkProviderConfigs()
  }, [modelSelection, setModelSelection])

  // Check if compression is needed and get API key when session or model changes
  useEffect(() => {
    const checkCompression = async (): Promise<void> => {
      if (!currentSessionId || !modelSelection) {
        setCompressionNeeded(false)
        return
      }

      try {
        // Get provider configuration to get provider type, model name, and API key
        const configResult = await window.backend.getProviderConfiguration(modelSelection.providerConfigId)
        if (!isOk(configResult) || !configResult.value) {
          return
        }

        const providerConfig = configResult.value
        const provider = providerConfig.type
        const model = modelSelection.modelId

        // Store API key for compression
        setApiKey(providerConfig.config.apiKey || '')

        // Check if compression is needed
        const result = await window.backend.checkCompressionNeeded(currentSessionId, provider, model)

        if (isOk(result)) {
          setCompressionNeeded(result.value)
        }
      } catch (err) {
        logger.error('Error checking compression needed', { sessionId: currentSessionId, error: err })
      }
    }

    checkCompression()
  }, [
    currentSessionId,
    modelSelection,
    currentSession?.updatedAt,
    currentSession?.messageCount,
    currentSession?.messages?.length,
    currentSession?.messages?.[currentSession.messages.length - 1]?.id
  ])

  // Handle compression completion
  const handleCompressionComplete = async (result: CompressionResult): Promise<void> => {
    setShowCompressionDialog(false)

    if (result.compressed) {
      logger.info('Compression completed successfully', { result })
      // Refresh the session to show updated messages and compression summaries
      await refreshSessions()
      await refreshCurrentSession()
    }
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {currentSession?.title || 'No Session'}
            </h1>
            {currentSession && (
              <div className="text-xs text-muted-foreground mt-1">
                {currentSession.messageCount} message{currentSession.messageCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <ModelSelector selectedModel={modelSelection} onModelChange={handleModelChange} />
              {hasAvailableModels && !modelSelection && (
                <div className="flex items-center gap-1 text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Not selected</span>
                </div>
              )}
            </div>
            <TokenUsageIndicator sessionId={currentSessionId} modelSelection={modelSelection} currentSession={currentSession} />
            {currentSessionId && modelSelection && apiKey && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCompressionDialog(true)}
                className={
                  compressionNeeded
                    ? 'flex items-center gap-1.5 text-orange-600 dark:text-orange-500 border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/30'
                    : 'flex items-center gap-1.5'
                }
              >
                <Archive className="h-4 w-4" />
                <span className="hidden sm:inline">Compress</span>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onSettings} className="h-9 w-9">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {!hasProviderConfigs ? (
          <div className="h-full flex items-center justify-center p-4">
            <Alert variant="destructive" className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No AI Provider Configured</AlertTitle>
              <AlertDescription className="mt-2 space-y-3">
                <p>You need to configure at least one AI provider to use the chat feature.</p>
                <Button variant="outline" onClick={onSettings} className="w-full">
                  <Settings className="mr-2 h-4 w-4" />
                  Go to Settings
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : !hasAvailableModels ? (
          <div className="h-full flex items-center justify-center p-4">
            <Alert variant="destructive" className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No Available Models</AlertTitle>
              <AlertDescription className="mt-2 space-y-3">
                <p>
                  Your AI providers are configured but no models are available. Please enable at
                  least one provider configuration and ensure it has models.
                </p>
                <Button variant="outline" onClick={onSettings} className="w-full">
                  <Settings className="mr-2 h-4 w-4" />
                  Go to Settings
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : !currentSession ? (
          <div className="h-full flex items-center justify-center p-4">
            <div className="text-center text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto opacity-50 mb-4" />
              <p className="text-lg">No session selected</p>
              <p className="text-sm mt-2">Create a new chat or select an existing one</p>
            </div>
          </div>
        ) : (
          <>
            {!modelSelection && (
              <Alert variant="destructive" className="m-4 mb-0">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Model Not Selected</AlertTitle>
                <AlertDescription>
                  Please select a model from the dropdown above to start chatting.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex-1 overflow-hidden">
              {modelSelection ? (
                <AIRuntimeProvider
                  key={currentSession?.id} // Force remount when session changes
                  modelSelection={modelSelection}
                  chatSessionId={currentSession?.id}
                  initialMessages={currentSession?.messages}
                  currentSession={currentSession}
                  onMessageCompleted={async () => {
                    await refreshSessions()
                    await refreshCurrentSession()
                  }}
                >
                  <Thread />
                </AIRuntimeProvider>
              ) : (
                <div className="h-full flex items-center justify-center p-4 text-gray-400">
                  <div className="text-center space-y-2">
                    <AlertCircle className="h-12 w-12 mx-auto opacity-50" />
                    <p className="text-lg">Select a model to start chatting</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Compression Dialog */}
      {currentSessionId && modelSelection && apiKey && (
        <CompressionConfirmDialog
          open={showCompressionDialog}
          sessionId={currentSessionId}
          modelSelection={modelSelection}
          apiKey={apiKey}
          onConfirm={handleCompressionComplete}
          onCancel={() => setShowCompressionDialog(false)}
        />
      )}
    </div>
  )
}
