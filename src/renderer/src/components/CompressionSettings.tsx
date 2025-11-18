import { useState, useEffect } from 'react'
import { Archive, Loader2, Save, CheckCircle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Slider } from '@renderer/components/ui/slider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'
import type { CompressionSettings as CompressionSettingsType } from '@common/types'

interface CompressionSettingsProps {
  className?: string
  sessionId?: string
}

export function CompressionSettings({ className, sessionId = 'global-defaults' }: CompressionSettingsProps): React.JSX.Element {
  const [settings, setSettings] = useState<CompressionSettingsType>({
    threshold: 0.95,
    retentionTokens: 2000,
    autoCompress: true
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async (): Promise<void> => {
      try {
        setIsLoading(true)
        setError(null)

        const result = await window.backend.getCompressionSettings(sessionId)

        if (isOk(result)) {
          setSettings(result.value)
          logger.info('Loaded compression settings', { sessionId, settings: result.value })
        } else {
          setError(`Failed to load settings: ${result.error}`)
          logger.error('Failed to load compression settings', { sessionId, error: result.error })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(`Failed to load settings: ${message}`)
        logger.error('Error loading compression settings', { sessionId, error: err })
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [sessionId])

  const handleSave = async (): Promise<void> => {
    try {
      setIsSaving(true)
      setError(null)
      setSaveSuccess(false)

      // Validate settings
      if (settings.threshold < 0.7 || settings.threshold > 1.0) {
        setError('Threshold must be between 70% and 100%')
        return
      }
      if (settings.retentionTokens < 0) {
        setError('Retention tokens must be positive')
        return
      }

      const result = await window.backend.setCompressionSettings(sessionId, settings)

      if (isOk(result)) {
        setSaveSuccess(true)
        logger.info('Saved compression settings', { sessionId, settings })

        // Auto-clear success message after 3 seconds
        setTimeout(() => {
          setSaveSuccess(false)
        }, 3000)
      } else {
        setError(`Failed to save settings: ${result.error}`)
        logger.error('Failed to save compression settings', { sessionId, error: result.error })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(`Failed to save settings: ${message}`)
      logger.error('Error saving compression settings', { sessionId, error: err })
    } finally {
      setIsSaving(false)
    }
  }

  const handleThresholdChange = (value: number[]): void => {
    setSettings({ ...settings, threshold: value[0] / 100 })
  }

  const handleRetentionTokensChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = parseInt(e.target.value, 10)
    if (!isNaN(value)) {
      setSettings({ ...settings, retentionTokens: value })
    }
  }

  const handleAutoCompressChange = (checked: boolean): void => {
    setSettings({ ...settings, autoCompress: checked })
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            <CardTitle>Conversation Compression</CardTitle>
          </div>
          <CardDescription>
            Configure automatic conversation history compression to manage context window limits
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5" />
          <CardTitle>Conversation Compression</CardTitle>
        </div>
        <CardDescription>
          Configure automatic conversation history compression to manage context window limits
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Compression Threshold */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="threshold" className="text-sm font-medium">
                Compression Threshold
              </Label>
              <span className="text-sm text-gray-500">
                {Math.round(settings.threshold * 100)}%
              </span>
            </div>
            <Slider
              id="threshold"
              min={70}
              max={100}
              step={1}
              value={[settings.threshold * 100]}
              onValueChange={handleThresholdChange}
              className="w-full"
            />
            <p className="text-xs text-gray-600">
              Compress when context usage exceeds this percentage of the model's limit
            </p>
          </div>

          {/* Retention Tokens */}
          <div className="space-y-3">
            <Label htmlFor="retentionTokens" className="text-sm font-medium">
              Retention Tokens
            </Label>
            <Input
              id="retentionTokens"
              type="number"
              min="0"
              step="100"
              value={settings.retentionTokens}
              onChange={handleRetentionTokensChange}
              className="max-w-xs"
            />
            <p className="text-xs text-gray-600">
              Number of recent message tokens to retain after compression
            </p>
          </div>

          {/* Auto-Compression Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="autoCompress" className="text-sm font-medium">
                Auto-Compression
              </Label>
              <p className="text-xs text-gray-600">
                Automatically compress when threshold is exceeded
              </p>
            </div>
            <Switch
              id="autoCompress"
              checked={settings.autoCompress}
              onCheckedChange={handleAutoCompressChange}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded bg-red-50 text-red-800 border border-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Save Button */}
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || saveSuccess}
              variant="outline"
              size="sm"
              className={
                saveSuccess
                  ? 'bg-green-600 hover:bg-green-700 text-white border-green-600'
                  : 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100 dark:bg-green-950 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900'
              }
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
