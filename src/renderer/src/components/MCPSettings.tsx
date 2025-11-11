import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Server as ServerIcon, Link, Unlink, AlertCircle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'
import { EventType } from '@common/types'
import type { AppEvent, MCPServerStatus, MCPServerWithStatus } from '@common/types'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'

interface MCPSettingsProps {
  className?: string
}

interface ServerFormData {
  name: string
  description: string
  command: string
  args: string
  env: Record<string, string>
  enabled: boolean
  includeResources: boolean
}

export function MCPSettings({ className }: MCPSettingsProps): React.JSX.Element {
  const [servers, setServers] = useState<MCPServerWithStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingServer, setEditingServer] = useState<MCPServerWithStatus | null>(null)
  const [formData, setFormData] = useState<ServerFormData>({
    name: '',
    description: '',
    command: '',
    args: '',
    env: {},
    enabled: true,
    includeResources: false
  })
  const [envInput, setEnvInput] = useState<{ key: string; value: string }[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadServers()
  }, [])

  useEffect(() => {
    const handleStatusChange = (event: AppEvent): void => {
      if (!event || event.type !== EventType.Status) {
        return
      }

      const status = event.payload as MCPServerStatus
      setServers((prev) => {
        let didUpdate = false
        const next = prev.map((server) => {
          if (server.id === status.serverId) {
            didUpdate = true
            return { ...server, runtimeStatus: status }
          }
          return server
        })
        return didUpdate ? next : prev
      })
    }

    window.backend.onEvent('mcpServerStatusChanged', handleStatusChange)
    return () => {
      window.backend.offEvent('mcpServerStatusChanged')
    }
  }, [])

  const loadServers = async (): Promise<void> => {
    setIsLoading(true)
    const result = await window.backend.listMCPServers()

    if (isOk(result)) {
      setServers(result.value)
    } else {
      logger.error('Failed to load MCP servers:', result.error)
      setMessage({
        type: 'error',
        text: `Failed to load MCP servers: ${result.error}`
      })
    }

    setIsLoading(false)
  }

  const handleOpenDialog = (server?: MCPServerWithStatus): void => {
    if (server) {
      setEditingServer(server)
      setFormData({
        name: server.name,
        description: server.description || '',
        command: server.command,
        args: server.args.join('\n'),
        env: server.env || {},
        enabled: server.enabled,
        includeResources: server.includeResources
      })
      setEnvInput(
        Object.entries(server.env || {}).map(([key, value]) => ({ key, value }))
      )
    } else {
      setEditingServer(null)
      setFormData({
        name: '',
        description: '',
        command: '',
        args: '',
        env: {},
        enabled: true,
        includeResources: false
      })
      setEnvInput([])
    }
    setShowDialog(true)
  }

  const handleCloseDialog = (options?: { preserveMessage?: boolean }): void => {
    setShowDialog(false)
    setEditingServer(null)
    if (!options?.preserveMessage) {
      setMessage(null)
    }
  }

  const handleSaveServer = async (): Promise<void> => {
    // Basic validation
    if (!formData.name.trim() || !formData.command.trim()) {
      setMessage({
        type: 'error',
        text: 'Server name and command are required'
      })
      return
    }

    // Parse args (one per line)
    const args = formData.args
      .split('\n')
      .map((arg) => arg.trim())
      .filter((arg) => arg.length > 0)

    // Parse env variables
    const env: Record<string, string> = {}
    envInput.forEach(({ key, value }) => {
      if (key.trim()) {
        env[key.trim()] = value
      }
    })

    const serverConfig = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      command: formData.command.trim(),
      args,
      env: Object.keys(env).length > 0 ? env : undefined,
      enabled: formData.enabled,
      includeResources: formData.includeResources
    }

    const serverName = formData.name
    const isEdit = Boolean(editingServer)

    setMessage(null)
    handleCloseDialog({ preserveMessage: true })

    if (isEdit) {
      const result = await window.backend.updateMCPServer(editingServer!.id, serverConfig)
      await loadServers()

      if (isOk(result)) {
        setMessage({
          type: 'success',
          text: `Server "${serverName}" updated successfully`
        })
      } else {
        logger.error('Failed to update server:', result.error)
        setMessage({
          type: 'error',
          text: `Failed to update server: ${result.error}`
        })
      }
    } else {
      const result = await window.backend.addMCPServer(serverConfig)
      await loadServers()

      if (isOk(result)) {
        setMessage({
          type: 'success',
          text: `Server "${serverName}" added successfully`
        })
      } else {
        logger.error('Failed to add server:', result.error)
        setMessage({
          type: 'error',
          text: `Failed to add server: ${result.error}`
        })
      }
    }
  }

  const handleDeleteServer = async (server: MCPServerWithStatus): Promise<void> => {
    if (!confirm(`Are you sure you want to delete "${server.name}"?`)) {
      return
    }

    const result = await window.backend.removeMCPServer(server.id)

    if (isOk(result)) {
      setMessage({
        type: 'success',
        text: `Server "${server.name}" deleted successfully`
      })
      await loadServers()
    } else {
      logger.error('Failed to delete server:', result.error)
      setMessage({
        type: 'error',
        text: `Failed to delete server: ${result.error}`
      })
    }
  }

  const handleToggleEnabled = async (server: MCPServerWithStatus): Promise<void> => {
    const result = await window.backend.updateMCPServer(server.id, {
      enabled: !server.enabled
    })

    await loadServers()

    if (isOk(result)) {
      setMessage({
        type: 'success',
        text: `Server "${server.name}" ${!server.enabled ? 'enabled' : 'disabled'}`
      })
    } else {
      logger.error('Failed to toggle server:', result.error)
      setMessage({
        type: 'error',
        text: `Failed to toggle server: ${result.error}`
      })
    }
  }

  const addEnvVar = (): void => {
    setEnvInput([...envInput, { key: '', value: '' }])
  }

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string): void => {
    const updated = [...envInput]
    updated[index][field] = value
    setEnvInput(updated)
  }

  const removeEnvVar = (index: number): void => {
    setEnvInput(envInput.filter((_, i) => i !== index))
  }

  const getEnabledBadge = (server: MCPServerWithStatus) => {
    if (!server.enabled) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
          <Unlink className="h-3 w-3" />
          Disabled
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
        <Link className="h-3 w-3" />
        Enabled
      </span>
    )
  }

  const getRuntimeStatusBadge = (server: MCPServerWithStatus) => {
    const status = server.runtimeStatus.status
    if (status === 'connected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
          <Link className="h-3 w-3" />
          Connected
        </span>
      )
    }
    if (status === 'error') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
          <AlertCircle className="h-3 w-3" />
          Error
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
        <ServerIcon className="h-3 w-3" />
        Stopped
      </span>
    )
  }

  const formatStatusTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) {
      return timestamp
    }
    return date.toLocaleString()
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>MCP Servers</CardTitle>
              <CardDescription>
                Manage Model Context Protocol servers to extend AI capabilities with external tools and
                resources
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Server
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading servers...</div>
          ) : servers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <ServerIcon className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm">No MCP servers configured</p>
              <p className="text-xs mt-1">Click &quot;Add Server&quot; to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {servers.map((server) => (
                <div
                  key={server.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="font-medium text-gray-900">{server.name}</h3>
                        {getEnabledBadge(server)}
                        {getRuntimeStatusBadge(server)}
                        {server.includeResources && (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                            Resources as Tools
                          </span>
                        )}
                      </div>
                      {server.description && (
                        <p className="text-sm text-gray-600 mb-2">{server.description}</p>
                      )}
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>
                          <span className="font-medium">Command:</span>{' '}
                          <code className="bg-gray-100 px-1 rounded">{server.command}</code>
                          {server.args.length > 0 && (
                            <>
                              {' '}
                              {server.args.map((arg, i) => (
                                <code key={i} className="bg-gray-100 px-1 rounded ml-1">
                                  {arg}
                                </code>
                              ))}
                            </>
                          )}
                        </div>
                        {server.env && Object.keys(server.env).length > 0 && (
                          <div>
                            <span className="font-medium">Env vars:</span>{' '}
                            {Object.keys(server.env).join(', ')}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Runtime updated:</span>{' '}
                          {formatStatusTimestamp(server.runtimeStatus.updatedAt)}
                        </div>
                      </div>
                      {server.runtimeStatus.status === 'error' && (
                        <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          <div className="space-y-2 w-full">
                            <div>
                              <p className="font-medium">Last error</p>
                              {server.runtimeStatus.error && (
                                <p className="mt-1 whitespace-pre-wrap text-xs">
                                  {server.runtimeStatus.error}
                                </p>
                              )}
                              <p className="mt-1 text-[11px] opacity-80">
                                Reported at {formatStatusTimestamp(server.runtimeStatus.updatedAt)}
                              </p>
                            </div>
                            {server.runtimeStatus.errorDetails && (
                              <pre className="w-full whitespace-pre-wrap rounded border border-red-100 bg-white/40 p-2 text-[11px] text-red-900 overflow-x-auto">
                                {server.runtimeStatus.errorDetails}
                              </pre>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleEnabled(server)}
                        className="min-w-[80px]"
                      >
                        {server.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(server)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteServer(server)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingServer ? 'Edit MCP Server' : 'Add MCP Server'}</DialogTitle>
            <DialogDescription>
              Configure a Model Context Protocol server to provide tools and resources to the AI
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Server Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Filesystem Server"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Access local files and directories"
              />
            </div>

            <div>
              <Label htmlFor="command">Command *</Label>
              <Input
                id="command"
                value={formData.command}
                onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                placeholder="e.g., node, python, npx"
              />
            </div>

            <div>
              <Label htmlFor="args">Arguments (one per line) *</Label>
              <textarea
                id="args"
                value={formData.args}
                onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                placeholder="/path/to/server.js&#10;--config&#10;/path/to/config.json"
                className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background"
              />
            </div>

            <div>
              <Label>Environment Variables (optional)</Label>
              <div className="space-y-2 mt-2">
                {envInput.map((env, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="Key"
                      value={env.key}
                      onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Value"
                      value={env.value}
                      onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEnvVar(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addEnvVar}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Variable
                </Button>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="mt-1"
                />
                <div>
                  <Label htmlFor="enabled" className="cursor-pointer">
                    Enabled
                  </Label>
                  <p className="text-xs text-gray-500 mt-1">
                    Server will start automatically when enabled
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="includeResources"
                  checked={formData.includeResources}
                  onChange={(e) => setFormData({ ...formData, includeResources: e.target.checked })}
                  className="mt-1"
                />
                <div>
                  <Label htmlFor="includeResources" className="cursor-pointer">
                    Include resources as tools
                  </Label>
                  <div className="flex items-start gap-2 mt-1">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      Warning: May increase context size for this server. Use only if resources are
                      limited.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {message && (
              <div
                className={`p-3 rounded-md text-sm ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {message.text}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleCloseDialog()}>
              Cancel
            </Button>
            <Button onClick={handleSaveServer}>
              {editingServer ? 'Update Server' : 'Add Server'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {message && !showDialog && (
        <div
          className={`mt-4 p-4 rounded-md ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}
    </>
  )
}
