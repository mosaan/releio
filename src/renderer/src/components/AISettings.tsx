import { useState, useEffect, useCallback } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { CheckCircle, Loader2, Trash2, XCircle } from 'lucide-react'
import type {
  AIProvider,
  AISettingsV2,
  AIProviderConfig,
  AzureProviderConfig,
  AIConfig
} from '@common/types'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'

interface AISettingsProps {
  className?: string
}

export function AISettings({ className = '' }: AISettingsProps): React.JSX.Element {
  const [settings, setSettings] = useState<AISettingsV2 | null>(null)
  const [activeProvider, setActiveProvider] = useState<AIProvider>('openai')

  // Provider-specific state
  const [apiKey, setApiKey] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [azureResourceName, setAzureResourceName] = useState('')
  const [azureUseDeploymentUrls, setAzureUseDeploymentUrls] = useState(false)

  // UI state
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)
  const [testError, setTestError] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  // Update form when active provider changes
  useEffect(() => {
    if (settings) {
      loadProviderConfig(activeProvider)
    }
  }, [activeProvider, settings])

  const loadSettings = useCallback(async (): Promise<void> => {
    try {
      await window.connectBackend()
      const result = await window.backend.getAISettingsV2()
      if (isOk(result)) {
        setSettings(result.value)
        logger.info('Loaded AI settings v2')
      } else {
        logger.error('Failed to load AI settings v2:', result.error)
      }
    } catch (error) {
      logger.error('Failed to load AI settings:', error)
    }
  }, [])

  const loadProviderConfig = (provider: AIProvider): void => {
    if (!settings) return

    const config = settings.providers[provider]
    if (config) {
      setApiKey(config.apiKey || '')
      setBaseURL(config.baseURL || '')

      if (provider === 'azure') {
        const azureConfig = config as AzureProviderConfig
        setAzureResourceName(azureConfig.resourceName || '')
        // Use ?? instead of || to properly handle boolean false
        setAzureUseDeploymentUrls(azureConfig.useDeploymentBasedUrls ?? false)
        logger.debug('Loaded Azure config:', {
          resourceName: azureConfig.resourceName,
          useDeploymentBasedUrls: azureConfig.useDeploymentBasedUrls,
          baseURL: azureConfig.baseURL
        })
      } else {
        setAzureResourceName('')
        setAzureUseDeploymentUrls(false)
      }
    } else {
      // No config for this provider yet
      setApiKey('')
      setBaseURL('')
      setAzureResourceName('')
      setAzureUseDeploymentUrls(false)
    }
  }

  const testConnection = async (): Promise<void> => {
    if (!apiKey) return

    setIsTesting(true)
    setTestSuccess(false)
    setTestError(false)

    try {
      const modelsResult = await window.backend.getAIModels(activeProvider)
      let testModel = 'gpt-4o'

      if (isOk(modelsResult) && modelsResult.value.length > 0) {
        testModel = modelsResult.value[0]
      }

      const config: AIConfig = {
        provider: activeProvider,
        model: testModel,
        apiKey: apiKey,
        baseURL: baseURL || undefined,
        // Azure-specific fields
        resourceName: activeProvider === 'azure' ? (azureResourceName || undefined) : undefined,
        useDeploymentBasedUrls: activeProvider === 'azure' ? azureUseDeploymentUrls : undefined
      }

      const result = await window.backend.testAIProviderConnection(config)

      if (isOk(result) && result.value) {
        setTestSuccess(true)
        setTimeout(() => setTestSuccess(false), 3000)
      } else {
        setTestError(true)
        setTimeout(() => setTestError(false), 3000)
      }
    } catch (error) {
      logger.error(`Failed to test ${activeProvider} connection:`, error)
      setTestError(true)
      setTimeout(() => setTestError(false), 5000)
    } finally {
      setIsTesting(false)
    }
  }

  const saveProviderConfig = async (): Promise<void> => {
    if (!apiKey) return

    setIsSaving(true)
    setSaveSuccess(false)

    try {
      let config: AIProviderConfig | AzureProviderConfig

      if (activeProvider === 'azure') {
        config = {
          apiKey,
          useDeploymentBasedUrls: azureUseDeploymentUrls
        } as AzureProviderConfig

        // Add optional properties only if they have values
        if (baseURL) {
          config.baseURL = baseURL
        }
        if (azureResourceName) {
          (config as AzureProviderConfig).resourceName = azureResourceName
        }

        logger.debug('Saving Azure config:', {
          resourceName: azureResourceName,
          useDeploymentBasedUrls: azureUseDeploymentUrls,
          baseURL: baseURL
        })
      } else {
        config = {
          apiKey
        }
        // Add baseURL only if it has a value
        if (baseURL) {
          config.baseURL = baseURL
        }
      }

      const result = await window.backend.updateProviderConfig(activeProvider, config)

      if (isOk(result)) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
        // Reload settings to update local state
        await loadSettings()
      } else {
        logger.error('Failed to save provider config:', result.error)
      }
    } catch (error) {
      logger.error('Failed to save provider config:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const clearProviderConfig = async (): Promise<void> => {
    const confirmed = confirm(
      `Clear ${activeProvider.toUpperCase()} configuration?\n\nThis will remove the API key and all settings for this provider.`
    )

    if (!confirmed) return

    try {
      // Update with empty config (keeping structure but clearing sensitive data)
      const emptyConfig: AIProviderConfig = {
        apiKey: ''
      }

      await window.backend.updateProviderConfig(activeProvider, emptyConfig)

      // Clear form
      setApiKey('')
      setBaseURL('')
      setAzureResourceName('')
      setAzureUseDeploymentUrls(false)

      // Reload settings
      await loadSettings()

      logger.info(`Cleared ${activeProvider} provider configuration`)
    } catch (error) {
      logger.error('Failed to clear provider config:', error)
    }
  }

  const renderProviderForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="api-key">API Key *</Label>
        <Input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your API key"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="base-url">Base URL (Optional)</Label>
        <Input
          id="base-url"
          type="text"
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          placeholder="Custom endpoint URL"
        />
        <p className="text-xs text-muted-foreground">
          For OpenAI-compatible APIs or custom endpoints
        </p>
      </div>

      {activeProvider === 'azure' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="azure-resource">Azure Resource Name</Label>
            <Input
              id="azure-resource"
              type="text"
              value={azureResourceName}
              onChange={(e) => setAzureResourceName(e.target.value)}
              placeholder="Your Azure resource name"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="azure-deployment-urls"
              checked={azureUseDeploymentUrls}
              onChange={(e) => setAzureUseDeploymentUrls(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="azure-deployment-urls" className="font-normal">
              Use deployment-based URLs
            </Label>
          </div>
        </>
      )}

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <Button
            onClick={testConnection}
            disabled={!apiKey || isTesting}
            variant={testSuccess ? 'default' : testError ? 'destructive' : 'outline'}
            size="sm"
            className={
              testSuccess
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : testError
                  ? 'bg-orange-500 hover:bg-orange-600 text-white'
                  : ''
            }
          >
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Testing...
              </>
            ) : testSuccess ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Success!
              </>
            ) : testError ? (
              <>
                <XCircle className="h-4 w-4 mr-2" />
                Failed
              </>
            ) : (
              'Test Connection'
            )}
          </Button>

          <Button
            onClick={clearProviderConfig}
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <Button
          onClick={saveProviderConfig}
          disabled={!apiKey || isSaving}
          size="sm"
          variant={saveSuccess ? 'default' : 'default'}
          className={saveSuccess ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Saved!
            </>
          ) : (
            'Save Configuration'
          )}
        </Button>
      </div>
    </div>
  )

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">AI Provider Configuration</CardTitle>
        <CardDescription>
          Configure API keys and settings for each AI provider
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeProvider} onValueChange={(value) => setActiveProvider(value as AIProvider)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="openai">OpenAI</TabsTrigger>
            <TabsTrigger value="anthropic">Anthropic</TabsTrigger>
            <TabsTrigger value="google">Google</TabsTrigger>
            <TabsTrigger value="azure">Azure</TabsTrigger>
          </TabsList>

          <TabsContent value="openai" className="space-y-4">
            {renderProviderForm()}
          </TabsContent>

          <TabsContent value="anthropic" className="space-y-4">
            {renderProviderForm()}
          </TabsContent>

          <TabsContent value="google" className="space-y-4">
            {renderProviderForm()}
          </TabsContent>

          <TabsContent value="azure" className="space-y-4">
            {renderProviderForm()}
          </TabsContent>
        </Tabs>

        {/* Presets section - basic display for now */}
        {settings && settings.presets.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-sm font-semibold mb-3">Configured Presets</h3>
            <div className="space-y-2">
              {settings.presets.map((preset) => (
                <div
                  key={preset.id}
                  className="text-sm p-2 bg-muted rounded flex items-center justify-between"
                >
                  <span>
                    {preset.name}
                    {settings.defaultPresetId === preset.id && (
                      <span className="ml-2 text-xs text-muted-foreground">(default)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
