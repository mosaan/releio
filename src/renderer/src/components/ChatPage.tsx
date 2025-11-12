import { useState, useEffect } from 'react'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Thread } from '@renderer/components/assistant-ui/thread'
import { AIRuntimeProvider } from '@renderer/components/AIRuntimeProvider'
import { ModelSelector } from '@renderer/components/ModelSelector'
import type { AIModelSelection } from '@common/types'

interface ChatPageProps {
  onBack: () => void
}

const LAST_MODEL_SELECTION_KEY = 'ai-last-model-selection'

export function ChatPage({ onBack }: ChatPageProps): React.JSX.Element {
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
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">AI Assistant</h1>
            </div>
          </div>

          <ModelSelector
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <AIRuntimeProvider modelSelection={selectedModel}>
          <Thread />
        </AIRuntimeProvider>
      </main>
    </div>
  )
}
