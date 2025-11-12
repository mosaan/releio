import { useState, useEffect } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { RefreshCw, Plus, X, Loader2, CheckCircle, XCircle } from 'lucide-react'
import type {
  AIProvider,
  AIProviderConfiguration,
  AIProviderConfig,
  AzureProviderConfig,
  AIModelDefinition
} from '@common/types'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'
import { Switch } from '@renderer/components/ui/switch'
import { Card } from '@renderer/components/ui/card'

interface ProviderConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: AIProviderConfiguration | null
  onSave: () => void
}

export function ProviderConfigDialog({
  open,
  onOpenChange,
  config,
  onSave
}: ProviderConfigDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [type, setType] = useState<AIProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [azureResourceName, setAzureResourceName] = useState('')
  const [azureUseDeploymentUrls, setAzureUseDeploymentUrls] = useState(false)
  const [models, setModels] = useState<AIModelDefinition[]>([])
  const [modelRefreshEnabled, setModelRefreshEnabled] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshSuccess, setRefreshSuccess] = useState(false)
  const [refreshError, setRefreshError] = useState(false)

  // Custom model add state
  const [isAddingCustomModel, setIsAddingCustomModel] = useState(false)
  const [newModelId, setNewModelId] = useState('')
  const [newModelDisplayName, setNewModelDisplayName] = useState('')

  useEffect(() => {
    if (config && open) {
      setName(config.name)
      setType(config.type)
      setApiKey(config.config.apiKey || '')
      setBaseURL(config.config.baseURL || '')

      if (config.type === 'azure') {
        const azureConfig = config.config as AzureProviderConfig
        setAzureResourceName(azureConfig.resourceName || '')
        setAzureUseDeploymentUrls(azureConfig.useDeploymentBasedUrls || false)
      }

      setModels(config.models)
      setModelRefreshEnabled(config.modelRefreshEnabled)
      setEnabled(config.enabled)
    } else if (!config && open) {
      // Reset for new config
      setName('')
      setType('openai')
      setApiKey('')
      setBaseURL('')
      setAzureResourceName('')
      setAzureUseDeploymentUrls(false)
      setModels([])
      setModelRefreshEnabled(true)
      setEnabled(true)
    }
  }, [config, open])

  const handleSave = async (): Promise<void> => {
    if (!name.trim() || !apiKey.trim()) {
      alert('Name and API Key are required')
      return
    }

    setIsSaving(true)

    try {
      let providerConfig: AIProviderConfig | AzureProviderConfig

      if (type === 'azure') {
        providerConfig = {
          apiKey,
          baseURL: baseURL || undefined,
          resourceName: azureResourceName || undefined,
          useDeploymentBasedUrls: azureUseDeploymentUrls
        } as AzureProviderConfig
      } else {
        providerConfig = {
          apiKey,
          baseURL: baseURL || undefined
        } as AIProviderConfig
      }

      if (config) {
        // Update existing
        const result = await window.backend.updateProviderConfiguration(config.id, {
          name,
          config: providerConfig,
          modelRefreshEnabled,
          enabled
        })

        if (isOk(result)) {
          logger.info(`Updated provider configuration: ${name}`)
          onSave()
          onOpenChange(false)
        } else {
          logger.error('Failed to update provider configuration:', result.error)
          alert('Failed to save configuration')
        }
      } else {
        // Create new
        const result = await window.backend.createProviderConfiguration({
          name,
          type,
          config: providerConfig,
          models,
          modelRefreshEnabled,
          enabled
        })

        if (isOk(result)) {
          logger.info(`Created provider configuration: ${name}`)
          onSave()
          onOpenChange(false)
        } else {
          logger.error('Failed to create provider configuration:', result.error)
          alert('Failed to create configuration')
        }
      }
    } catch (error) {
      logger.error('Failed to save provider configuration:', error)
      alert('Failed to save configuration')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRefreshModels = async (): Promise<void> => {
    if (!config) return

    setIsRefreshing(true)
    setRefreshSuccess(false)
    setRefreshError(false)

    try {
      const result = await window.backend.refreshModelsFromAPI(config.id)
      if (isOk(result)) {
        setModels(result.value)
        setRefreshSuccess(true)
        logger.info(`Refreshed models for ${config.name}`, { count: result.value.length })

        setTimeout(() => setRefreshSuccess(false), 3000)
      } else {
        setRefreshError(true)
        logger.error('Failed to refresh models:', result.error)

        setTimeout(() => setRefreshError(false), 5000)
      }
    } catch (error) {
      setRefreshError(true)
      logger.error('Failed to refresh models:', error)

      setTimeout(() => setRefreshError(false), 5000)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleAddCustomModel = async (): Promise<void> => {
    if (!config || !newModelId.trim()) {
      alert('Model ID is required')
      return
    }

    try {
      const result = await window.backend.addModelToConfiguration(config.id, {
        id: newModelId,
        displayName: newModelDisplayName || undefined
      })

      if (isOk(result)) {
        // Reload configuration to get updated model list
        const configResult = await window.backend.getProviderConfiguration(config.id)
        if (isOk(configResult) && configResult.value) {
          setModels(configResult.value.models)
        }
        setNewModelId('')
        setNewModelDisplayName('')
        setIsAddingCustomModel(false)
        logger.info(`Added custom model: ${newModelId}`)
      } else {
        logger.error('Failed to add custom model:', result.error)
        alert('Failed to add model. It may already exist.')
      }
    } catch (error) {
      logger.error('Failed to add custom model:', error)
      alert('Failed to add model')
    }
  }

  const handleDeleteModel = async (modelId: string): Promise<void> => {
    if (!config) return

    if (!confirm(`Are you sure you want to delete model "${modelId}"?`)) {
      return
    }

    try {
      const result = await window.backend.deleteModelFromConfiguration(config.id, modelId)
      if (isOk(result)) {
        setModels(models.filter((m) => m.id !== modelId))
        logger.info(`Deleted model: ${modelId}`)
      } else {
        logger.error('Failed to delete model:', result.error)
        alert('Failed to delete model')
      }
    } catch (error) {
      logger.error('Failed to delete model:', error)
      alert('Failed to delete model')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{config ? `Edit: ${config.name}` : 'Add New Provider Configuration'}</DialogTitle>
          <DialogDescription>
            {config
              ? 'Update provider settings and manage models'
              : 'Configure a new AI provider connection'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. OpenAI Official, LocalLM Server"
            />
          </div>

          {/* Type (only for new configs) */}
          {!config && (
            <div>
              <Label htmlFor="type">Provider Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as AIProvider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="azure">Azure OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* API Key */}
          <div>
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key"
            />
          </div>

          {/* Base URL */}
          <div>
            <Label htmlFor="baseURL">Base URL (Optional)</Label>
            <Input
              id="baseURL"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="For OpenAI-compatible APIs"
            />
          </div>

          {/* Azure-specific fields */}
          {(type === 'azure' || config?.type === 'azure') && (
            <>
              <div>
                <Label htmlFor="azureResourceName">Azure Resource Name</Label>
                <Input
                  id="azureResourceName"
                  value={azureResourceName}
                  onChange={(e) => setAzureResourceName(e.target.value)}
                  placeholder="your-resource-name"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={azureUseDeploymentUrls}
                  onCheckedChange={setAzureUseDeploymentUrls}
                />
                <Label>Use deployment-based URLs</Label>
              </div>
            </>
          )}

          {/* Model Management (only for existing configs) */}
          {config && (
            <Card className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Models</h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRefreshModels}
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : refreshSuccess ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : refreshError ? (
                        <XCircle className="h-4 w-4 text-red-600" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-2">Refresh from API</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsAddingCustomModel(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Custom
                    </Button>
                  </div>
                </div>

                {/* Custom model add form */}
                {isAddingCustomModel && (
                  <div className="border rounded p-3 space-y-2 bg-gray-50">
                    <Input
                      placeholder="Model ID (required)"
                      value={newModelId}
                      onChange={(e) => setNewModelId(e.target.value)}
                    />
                    <Input
                      placeholder="Display Name (optional)"
                      value={newModelDisplayName}
                      onChange={(e) => setNewModelDisplayName(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddCustomModel}>
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsAddingCustomModel(false)
                          setNewModelId('')
                          setNewModelDisplayName('')
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Model list */}
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {models.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No models found. Click "Refresh from API" to load models.
                    </p>
                  ) : (
                    models.map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center justify-between p-2 hover:bg-gray-50 rounded"
                      >
                        <div className="flex-1 text-sm">
                          <span className="font-mono">{model.displayName || model.id}</span>
                          {model.displayName && (
                            <span className="text-gray-500 ml-2">({model.id})</span>
                          )}
                          <span className="text-xs text-gray-500 ml-2">
                            ({model.source === 'custom' ? 'Custom' : 'API'})
                          </span>
                        </div>
                        {model.source === 'custom' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteModel(model.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Settings */}
          <div className="flex items-center gap-2">
            <Switch checked={modelRefreshEnabled} onCheckedChange={setModelRefreshEnabled} />
            <Label>Auto-refresh models from API</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label>Enable this configuration</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
