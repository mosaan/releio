import { useState, useEffect, useCallback } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
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
import { Loader2, RefreshCw, CheckCircle } from 'lucide-react'
import type { ProxySettings, ProxyMode } from '@common/types'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'

interface ProxySettingsProps {
  className?: string
}

export function ProxySettings({ className = '' }: ProxySettingsProps): React.JSX.Element {
  const [mode, setMode] = useState<ProxyMode>('system')
  const [httpProxy, setHttpProxy] = useState('')
  const [httpsProxy, setHttpsProxy] = useState('')
  const [noProxy, setNoProxy] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingSystem, setIsLoadingSystem] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const loadSettings = useCallback(async (): Promise<void> => {
    try {
      await window.connectBackend()
      const result = await window.backend.getProxySettings()
      if (isOk(result)) {
        const settings = result.value
        setMode(settings.mode)
        setHttpProxy(settings.httpProxy || '')
        setHttpsProxy(settings.httpsProxy || '')
        setNoProxy((settings.noProxy || []).join(', '))
        setUsername(settings.username || '')
        setPassword(settings.password || '')
      } else {
        logger.error('Failed to get proxy settings:', result.error)
      }
    } catch (error) {
      logger.error('Failed to load proxy settings:', error)
    }
  }, [])

  const loadSystemSettings = async (): Promise<void> => {
    setIsLoadingSystem(true)
    try {
      const result = await window.backend.getSystemProxySettings()
      if (isOk(result)) {
        const settings = result.value
        setMode('system')
        setHttpProxy(settings.httpProxy || '')
        setHttpsProxy(settings.httpsProxy || '')
        setNoProxy((settings.noProxy || []).join(', '))
        // Clear credentials when loading system settings
        setUsername('')
        setPassword('')
      } else {
        logger.error('Failed to get system proxy settings:', result.error)
      }
    } catch (error) {
      logger.error('Failed to load system proxy settings:', error)
    } finally {
      setIsLoadingSystem(false)
    }
  }

  const saveSettings = async (): Promise<void> => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      const settings: ProxySettings = {
        mode,
        httpProxy: httpProxy || undefined,
        httpsProxy: httpsProxy || undefined,
        noProxy: noProxy ? noProxy.split(',').map((s) => s.trim()) : undefined,
        username: username || undefined,
        password: password || undefined
      }

      const result = await window.backend.setProxySettings(settings)
      if (isOk(result)) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
        logger.info('Proxy settings saved successfully')
      } else {
        logger.error('Failed to save proxy settings:', result.error)
      }
    } catch (error) {
      logger.error('Failed to save proxy settings:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleModeChange = async (newMode: ProxyMode): Promise<void> => {
    setMode(newMode)
    if (newMode === 'system') {
      await loadSystemSettings()
    } else if (newMode === 'none') {
      setHttpProxy('')
      setHttpsProxy('')
      setNoProxy('')
      setUsername('')
      setPassword('')
    }
  }


  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const isCustomMode = mode === 'custom'

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Proxy Settings</CardTitle>
        <CardDescription>
          Configure proxy settings for network requests
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="proxy-mode">Proxy Mode</Label>
          <Select value={mode} onValueChange={handleModeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System Proxy</SelectItem>
              <SelectItem value="custom">Custom Proxy</SelectItem>
              <SelectItem value="none">No Proxy</SelectItem>
            </SelectContent>
          </Select>
          {mode === 'system' && (
            <p className="text-sm text-gray-600">
              Using system proxy settings from Windows
            </p>
          )}
        </div>

        {mode !== 'none' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="http-proxy">HTTP Proxy</Label>
                <Input
                  id="http-proxy"
                  type="text"
                  value={httpProxy}
                  onChange={(e) => setHttpProxy(e.target.value)}
                  placeholder="http://proxy.example.com:8080"
                  disabled={!isCustomMode}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="https-proxy">HTTPS Proxy</Label>
                <Input
                  id="https-proxy"
                  type="text"
                  value={httpsProxy}
                  onChange={(e) => setHttpsProxy(e.target.value)}
                  placeholder="https://proxy.example.com:8443"
                  disabled={!isCustomMode}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="no-proxy">No Proxy (comma-separated)</Label>
              <Input
                id="no-proxy"
                type="text"
                value={noProxy}
                onChange={(e) => setNoProxy(e.target.value)}
                placeholder="localhost, *.local, 127.0.0.1"
                disabled={!isCustomMode}
              />
              <p className="text-sm text-gray-600">
                Hosts that should bypass the proxy
              </p>
            </div>

            {isCustomMode && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="proxy-username">Username (optional)</Label>
                  <Input
                    id="proxy-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proxy-password">Password (optional)</Label>
                  <Input
                    id="proxy-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                  />
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'system' && (
              <Button
                onClick={loadSystemSettings}
                disabled={isLoadingSystem}
                variant="outline"
                size="sm"
              >
                {isLoadingSystem ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reloading...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Reload System Settings
                  </>
                )}
              </Button>
            )}
          </div>

          <Button
            onClick={saveSettings}
            disabled={isSaving}
            size="sm"
            variant={saveSuccess ? 'default' : 'default'}
            className={saveSuccess ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Settings Saved!
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
