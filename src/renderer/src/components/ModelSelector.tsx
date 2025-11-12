import { useState, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import type { AISettingsV2, AIProviderConfiguration, AIModelSelection } from '@common/types'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'

interface ModelSelectorProps {
  selectedModel: AIModelSelection | null
  onModelChange: (selection: AIModelSelection | null) => void
}

export function ModelSelector({
  selectedModel,
  onModelChange
}: ModelSelectorProps): React.JSX.Element {
  const [settings, setSettings] = useState<AISettingsV2 | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async (): Promise<void> => {
    try {
      await window.connectBackend()
      const result = await window.backend.getAISettingsV2()
      if (isOk(result)) {
        setSettings(result.value)

        // If no model is selected, use default or first available
        if (!selectedModel) {
          if (result.value.defaultSelection) {
            onModelChange(result.value.defaultSelection)
          } else {
            // Select first enabled config with models
            const firstConfig = result.value.providerConfigs.find(
              (c) => c.enabled && c.models.length > 0
            )
            if (firstConfig) {
              onModelChange({
                providerConfigId: firstConfig.id,
                modelId: firstConfig.models[0].id
              })
            }
          }
        }
      } else {
        logger.error('Failed to load AI settings v3:', result.error)
      }
    } catch (error) {
      logger.error('Failed to load AI settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getProviderConfigLabel = (config: AIProviderConfiguration): string => {
    const hasApiKey = config.config.apiKey && config.config.apiKey.length > 0
    return hasApiKey ? config.name : `${config.name} (not configured)`
  }

  const isProviderConfigDisabled = (config: AIProviderConfiguration): boolean => {
    return !config.enabled || !config.config.apiKey || config.config.apiKey.length === 0
  }

  const getSelectionKey = (selection: AIModelSelection): string => {
    return `${selection.providerConfigId}:${selection.modelId}`
  }

  const parseSelectionKey = (key: string): AIModelSelection => {
    const [providerConfigId, modelId] = key.split(':')
    return { providerConfigId, modelId }
  }

  if (isLoading || !settings) {
    return (
      <Select disabled>
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="Loading models..." />
        </SelectTrigger>
      </Select>
    )
  }

  const enabledConfigs = settings.providerConfigs.filter(
    (config) => config.enabled && config.models.length > 0
  )

  if (enabledConfigs.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="No models configured" />
        </SelectTrigger>
      </Select>
    )
  }

  const currentKey = selectedModel ? getSelectionKey(selectedModel) : undefined

  return (
    <Select
      value={currentKey}
      onValueChange={(key) => onModelChange(parseSelectionKey(key))}
    >
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {settings.providerConfigs.map((config) => {
          if (config.models.length === 0) return null

          const isDisabled = isProviderConfigDisabled(config)
          const label = getProviderConfigLabel(config)

          return (
            <SelectGroup key={config.id}>
              <SelectLabel>{label}</SelectLabel>
              {config.models.map((model) => {
                const key = getSelectionKey({
                  providerConfigId: config.id,
                  modelId: model.id
                })
                const modelLabel = model.displayName || model.id
                const sourceLabel = model.source === 'custom' ? ' (Custom)' : ''
                const isDefault =
                  settings.defaultSelection?.providerConfigId === config.id &&
                  settings.defaultSelection?.modelId === model.id

                return (
                  <SelectItem key={key} value={key} disabled={isDisabled}>
                    {modelLabel}
                    {sourceLabel}
                    {isDefault && ' ⭐'}
                  </SelectItem>
                )
              })}
            </SelectGroup>
          )
        })}
      </SelectContent>
    </Select>
  )
}
