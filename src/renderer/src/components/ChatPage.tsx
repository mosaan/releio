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
        } else {
          setHasAvailableModels(false)
        }
      }
    }
    checkProviderConfigs()
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
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
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

      <main className="flex-1 overflow-hidden">
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
        ) : !selectedModel ? (
          <div className="h-full flex items-center justify-center p-4">
            <Alert className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No Model Selected</AlertTitle>
              <AlertDescription className="mt-2">
                <p>Please select a model from the dropdown above to start chatting.</p>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <AIRuntimeProvider modelSelection={selectedModel}>
            <Thread />
          </AIRuntimeProvider>
        )}
      </main>
    </div>
  )
}
