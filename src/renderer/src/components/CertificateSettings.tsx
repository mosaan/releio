import { useState, useEffect, useCallback } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  CheckCircle,
  Loader2,
  RefreshCw,
  FileText,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import type { CertificateSettings, CertificateMode, CustomCertificate } from '@common/types'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'

interface CertificateSettingsProps {
  className?: string
}

export function CertificateSettings({
  className = ''
}: CertificateSettingsProps): React.JSX.Element {
  const [mode, setMode] = useState<CertificateMode>('system')
  const [certificateCount, setCertificateCount] = useState(0)
  const [customCertificates, setCustomCertificates] = useState<CustomCertificate[]>([])
  const [certificateValidation, setCertificateValidation] = useState<
    Record<string, { valid: boolean; error?: string }>
  >({})
  const [rejectUnauthorized, setRejectUnauthorized] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingSystem, setIsLoadingSystem] = useState(false)
  const [isAddingCertificate, setIsAddingCertificate] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const loadSettings = useCallback(async (): Promise<void> => {
    try {
      await window.connectBackend()
      const result = await window.backend.getCertificateSettings()
      if (isOk(result)) {
        const settings = result.value
        setMode(settings.mode)

        if (settings.mode === 'custom' && settings.customCertificates) {
          const certs = settings.customCertificates as CustomCertificate[]
          setCustomCertificates(certs)
          setCertificateCount(certs.length)

          // Validate certificate paths
          await validateCertificatePaths()
        } else {
          setCertificateCount(settings.customCertificates?.length || 0)
          setCustomCertificates([])
        }

        setRejectUnauthorized(settings.rejectUnauthorized !== false)
      } else {
        logger.error('Failed to get certificate settings:', result.error)
      }
    } catch (error) {
      logger.error('Failed to load certificate settings:', error)
    }
  }, [])

  const loadSystemSettings = async (): Promise<void> => {
    setIsLoadingSystem(true)
    try {
      const result = await window.backend.getSystemCertificateSettings()
      if (isOk(result)) {
        const settings = result.value
        setMode('system')
        setCertificateCount(settings.customCertificates?.length || 0)
        setRejectUnauthorized(settings.rejectUnauthorized !== false)
      } else {
        logger.error('Failed to get system certificate settings:', result.error)
      }
    } catch (error) {
      logger.error('Failed to load system certificate settings:', error)
    } finally {
      setIsLoadingSystem(false)
    }
  }

  const saveSettings = async (): Promise<void> => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      // Get current settings to preserve custom certificates if in custom mode
      const currentResult = await window.backend.getCertificateSettings()
      const currentSettings: CertificateSettings = isOk(currentResult)
        ? currentResult.value
        : { mode: 'none' }

      const settings: CertificateSettings = {
        mode,
        rejectUnauthorized,
        customCertificates:
          mode === 'custom' ? currentSettings.customCertificates : undefined
      }

      const result = await window.backend.setCertificateSettings(settings)
      if (isOk(result)) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
        logger.info('Certificate settings saved successfully')
      } else {
        logger.error('Failed to save certificate settings:', result.error)
      }
    } catch (error) {
      logger.error('Failed to save certificate settings:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const validateCertificatePaths = async (): Promise<void> => {
    try {
      const result = await window.backend.validateCustomCertificates()
      if (isOk(result)) {
        const validation: Record<string, { valid: boolean; error?: string }> = {}
        for (const item of result.value) {
          validation[item.id] = { valid: item.valid, error: item.error }
        }
        setCertificateValidation(validation)
      }
    } catch (error) {
      logger.error('Failed to validate certificate paths:', error)
    }
  }

  const handleAddCertificate = async (): Promise<void> => {
    setIsAddingCertificate(true)
    try {
      // Open file dialog
      const result = await window.main.selectCertificateFile()
      if (!isOk(result)) {
        logger.error('Failed to open file dialog:', result.error)
        return
      }

      const filePath = result.value
      if (!filePath) {
        // User cancelled
        return
      }

      // Add certificate via backend
      const addResult = await window.backend.addCustomCertificate(filePath)
      if (isOk(addResult)) {
        logger.info('Certificate added successfully')
        // Reload settings to get updated list
        await loadSettings()
      } else {
        logger.error('Failed to add certificate:', addResult.error)
        alert(`Failed to add certificate: ${addResult.error}`)
      }
    } catch (error) {
      logger.error('Failed to add certificate:', error)
      alert(`Failed to add certificate: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsAddingCertificate(false)
    }
  }

  const handleRemoveCertificate = async (certificateId: string): Promise<void> => {
    try {
      const result = await window.backend.removeCustomCertificate(certificateId)
      if (isOk(result)) {
        logger.info('Certificate removed successfully')
        // Reload settings to get updated list
        await loadSettings()
      } else {
        logger.error('Failed to remove certificate:', result.error)
        alert(`Failed to remove certificate: ${result.error}`)
      }
    } catch (error) {
      logger.error('Failed to remove certificate:', error)
      alert(`Failed to remove certificate: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleModeChange = async (newMode: CertificateMode): Promise<void> => {
    setMode(newMode)
    if (newMode === 'system') {
      await loadSystemSettings()
    } else if (newMode === 'none') {
      setCertificateCount(0)
      setCustomCertificates([])
    } else if (newMode === 'custom') {
      // Load custom certificates
      await loadSettings()
    }
  }

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Certificate Settings</CardTitle>
        <CardDescription>
          Configure SSL/TLS certificate settings for secure connections
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cert-mode">Certificate Mode</Label>
          <Select value={mode} onValueChange={handleModeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System Certificates</SelectItem>
              <SelectItem value="custom">Custom Certificates</SelectItem>
              <SelectItem value="none">Default (Node.js)</SelectItem>
            </SelectContent>
          </Select>
          {mode === 'system' && (
            <p className="text-sm text-gray-600">
              Using certificates from Windows certificate store
            </p>
          )}
          {mode === 'custom' && (
            <div className="space-y-3 mt-3">
              {customCertificates.length > 0 ? (
                <div className="space-y-2">
                  {customCertificates.map((cert) => {
                    const validation = certificateValidation[cert.id]
                    const isValid = validation?.valid !== false

                    return (
                      <div
                        key={cert.id}
                        className="p-3 bg-gray-50 rounded-md border border-gray-200 space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isValid ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {cert.displayName || 'Certificate'}
                              </p>
                              <p className="text-xs text-gray-600 truncate" title={cert.path}>
                                {cert.path}
                              </p>
                            </div>
                          </div>
                          <Button
                            onClick={() => handleRemoveCertificate(cert.id)}
                            variant="ghost"
                            size="sm"
                            className="flex-shrink-0 h-8 w-8 p-0"
                          >
                            <Trash2 className="h-4 w-4 text-gray-500" />
                          </Button>
                        </div>
                        {!isValid && validation?.error && (
                          <p className="text-xs text-red-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {validation.error}
                          </p>
                        )}
                        {cert.issuer && (
                          <p className="text-xs text-gray-600">
                            <span className="font-medium">Issuer:</span> {cert.issuer}
                          </p>
                        )}
                        {cert.validUntil && (
                          <p className="text-xs text-gray-600">
                            <span className="font-medium">Valid until:</span>{' '}
                            {new Date(cert.validUntil).toLocaleDateString()}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          Added: {new Date(cert.addedAt).toLocaleDateString()}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-600">No custom certificates added yet</p>
              )}
              <Button
                onClick={handleAddCertificate}
                disabled={isAddingCertificate}
                variant="outline"
                size="sm"
                className="w-full"
              >
                {isAddingCertificate ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Certificate File
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {mode !== 'none' && (
          <div className="space-y-2">
            <Label htmlFor="cert-count">Loaded Certificates</Label>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border">
              <FileText className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-700">
                {certificateCount} certificate{certificateCount !== 1 ? 's' : ''} loaded
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="reject-unauthorized">Security</Label>
          <Select
            value={rejectUnauthorized ? 'true' : 'false'}
            onValueChange={(v) => setRejectUnauthorized(v === 'true')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Reject unauthorized certificates (Recommended)</SelectItem>
              <SelectItem value="false">Accept all certificates (Insecure)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-gray-600">
            {rejectUnauthorized
              ? 'Connections with invalid certificates will be rejected'
              : 'WARNING: Accepting all certificates is insecure and not recommended'}
          </p>
        </div>

        {mode === 'system' && (
          <div className="flex items-center gap-2 mb-4">
            <Button
              onClick={loadSystemSettings}
              disabled={isLoadingSystem}
              variant="outline"
              size="sm"
            >
              {isLoadingSystem ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reloading...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reload System Certificates
                </>
              )}
            </Button>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            onClick={saveSettings}
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
      </CardContent>
    </Card>
  )
}
