import { useState, useEffect, useCallback } from 'react'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { Plus, Edit, Trash2, AlertCircle } from 'lucide-react'
import type { AISettingsV2, AIProviderConfiguration } from '@common/types'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'
import { Switch } from '@renderer/components/ui/switch'
import { Badge } from '@renderer/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import { ProviderConfigDialog } from './ProviderConfigDialog'

interface AISettingsV2Props {
  className?: string
}

export function AISettingsV2Component({ className = '' }: AISettingsV2Props): React.JSX.Element {
  const [settings, setSettings] = useState<AISettingsV2 | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<AIProviderConfiguration | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [configToDelete, setConfigToDelete] = useState<AIProviderConfiguration | null>(null)

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = useCallback(async (): Promise<void> => {
    try {
      await window.connectBackend()
      const result = await window.backend.getAISettingsV2()

      // Debug: Log the entire result
      console.log('getAISettingsV2 result:', JSON.stringify(result, null, 2))

      if (isOk(result)) {
        // Debug: Check if providerConfigs exists
        console.log('result.value:', result.value)
        console.log('providerConfigs:', result.value?.providerConfigs)

        // Defensive: Ensure providerConfigs array exists
        const sanitizedSettings: AISettingsV2 = {
          version: 2,
          providerConfigs: result.value?.providerConfigs || [],
          defaultSelection: result.value?.defaultSelection
        }

        setSettings(sanitizedSettings)
        logger.info('Loaded AI settings v2', {
          providerCount: sanitizedSettings.providerConfigs.length
        })
      } else {
        logger.error('Failed to load AI settings v2:', result.error)
      }
    } catch (error) {
      logger.error('Failed to load AI settings:', error)
      console.error('Full error details:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleToggleEnabled = async (
    config: AIProviderConfiguration,
    enabled: boolean
  ): Promise<void> => {
    try {
      const result = await window.backend.updateProviderConfiguration(config.id, { enabled })
      if (isOk(result)) {
        await loadSettings()
        logger.info(`${enabled ? 'Enabled' : 'Disabled'} provider configuration: ${config.name}`)
      } else {
        logger.error('Failed to update provider configuration:', result.error)
      }
    } catch (error) {
      logger.error('Failed to toggle provider configuration:', error)
    }
  }

  const handleDelete = (config: AIProviderConfiguration): void => {
    setConfigToDelete(config)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async (): Promise<void> => {
    if (!configToDelete) return

    try {
      const result = await window.backend.deleteProviderConfiguration(configToDelete.id)
      if (isOk(result)) {
        await loadSettings()
        logger.info(`Deleted provider configuration: ${configToDelete.name}`)
      } else {
        logger.error('Failed to delete provider configuration:', result.error)
      }
    } catch (error) {
      logger.error('Failed to delete provider configuration:', error)
    } finally {
      setDeleteConfirmOpen(false)
      setConfigToDelete(null)
    }
  }

  const handleEdit = (config: AIProviderConfiguration): void => {
    setEditingConfig(config)
    setDialogOpen(true)
  }

  const handleAddNew = (): void => {
    setEditingConfig(null)
    setDialogOpen(true)
  }

  const handleDialogSave = async (): Promise<void> => {
    await loadSettings()
  }

  const getProviderTypeName = (type: string): string => {
    const typeNames: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      azure: 'Azure OpenAI'
    }
    return typeNames[type] || type
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>AI Provider Configurations</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>AI Provider Configurations</CardTitle>
        <CardDescription>
          Manage your AI provider configurations. You can add multiple instances of the same
          provider type.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!settings || settings.providerConfigs.length === 0 ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No AI Provider Configured</AlertTitle>
            <AlertDescription>
              You need to configure at least one AI provider to use the chat feature. Click "Add New
              Configuration" below to get started.
            </AlertDescription>
          </Alert>
        ) : null}

        <Button className="w-full" variant="outline" onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Configuration
        </Button>

        {!settings || settings.providerConfigs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No provider configurations found. Click "Add New Configuration" to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {settings.providerConfigs.map((config) => (
              <Card key={config.id} className="border-2">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={config.enabled}
                          onCheckedChange={(checked) => handleToggleEnabled(config, checked)}
                        />
                        <h3 className="font-semibold text-lg">{config.name}</h3>
                        {config.id === settings.defaultSelection?.providerConfigId && (
                          <Badge variant="secondary">Default</Badge>
                        )}
                      </div>

                      <div className="text-sm text-gray-600 space-y-1">
                        <div>
                          <span className="font-medium">Type:</span>{' '}
                          {getProviderTypeName(config.type)}
                        </div>
                        {config.config.baseURL && (
                          <div>
                            <span className="font-medium">Base URL:</span> {config.config.baseURL}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Models:</span> {config.models.length}{' '}
                          available
                          {config.models.filter((m) => m.source === 'custom').length > 0 && (
                            <span className="text-gray-500">
                              {' '}
                              ({config.models.filter((m) => m.source === 'custom').length} custom)
                            </span>
                          )}
                        </div>
                        {config.modelLastRefreshed && (
                          <div className="text-xs text-gray-500">
                            Last refreshed: {new Date(config.modelLastRefreshed).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(config)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(config)}
                        disabled={config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>

      <ProviderConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        config={editingConfig}
        onSave={handleDialogSave}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Provider Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{configToDelete?.name}&quot;? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
