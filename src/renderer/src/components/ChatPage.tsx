import { useState, useEffect } from 'react'
import { MessageCircle, Settings, AlertCircle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Thread } from '@renderer/components/assistant-ui/thread'
import { AIRuntimeProvider } from '@renderer/components/AIRuntimeProvider'
import { ModelSelector } from '@renderer/components/ModelSelector'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import type { AIModelSelection, AISettingsV2 } from '@common/types'
import { isOk } from '@common/result'

interface ChatPageProps {
  onSettings: () => void
}

const LAST_MODEL_SELECTION_KEY = 'ai-last-model-selection'

export function ChatPage({ onSettings }: ChatPageProps): React.JSX.Element {
  const [selectedModel, setSelectedModel] = useState<AIModelSelection | null>(() => {
    // Load last-used model selection from localStorage
    const stored = localStorage.getItem(LAST_MODEL_SELECTION_KEY)
    if (stored) {
      try {
        return JSON.parse(stored) as AIModelSelection
      } catch {
        return null
      }
    }
    return null
  })
  const [hasProviderConfigs, setHasProviderConfigs] = useState<boolean>(true)
  const [hasAvailableModels, setHasAvailableModels] = useState<boolean>(true)

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

          // Validate selectedModel - check if it still exists in available models
          // Get the current value from localStorage
          const stored = localStorage.getItem(LAST_MODEL_SELECTION_KEY)
          if (stored) {
            try {
              const storedSelection = JSON.parse(stored) as AIModelSelection
              const selectedConfig = settings.providerConfigs.find(
                (config) => config.id === storedSelection.providerConfigId
              )
              const modelExists =
                selectedConfig &&
                selectedConfig.enabled &&
                selectedConfig.models.some((model) => model.id === storedSelection.modelId)

              if (!modelExists) {
                // Selected model is no longer available, reset to null
                setSelectedModel(null)
                localStorage.removeItem(LAST_MODEL_SELECTION_KEY)
              }
            } catch {
              // Invalid stored data, remove it
              localStorage.removeItem(LAST_MODEL_SELECTION_KEY)
              setSelectedModel(null)
            }
          }
        } else {
          setHasAvailableModels(false)
        }
      }
    }
    checkProviderConfigs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist model selection to localStorage
  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem(LAST_MODEL_SELECTION_KEY, JSON.stringify(selectedModel))
    }
  }, [selectedModel])

  return (
    <div className="h-screen bg-background flex flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">AI Assistant</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <ModelSelector
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />
              {hasAvailableModels && !selectedModel && (
                <div className="flex items-center gap-1 text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Not selected</span>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onSettings}
              className="h-9 w-9"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

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
        ) : (
          <>
            {!selectedModel && (
              <Alert variant="destructive" className="m-4 mb-0">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Model Not Selected</AlertTitle>
                <AlertDescription>
                  Please select a model from the dropdown above to start chatting.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex-1 overflow-hidden">
              {selectedModel ? (
                <AIRuntimeProvider modelSelection={selectedModel}>
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
    </div>
  )
}
