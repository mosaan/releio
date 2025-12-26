import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Edit2, Save, X, Shield, ShieldCheck, ShieldX, Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'
import type { ToolPermissionRule, CreateToolPermissionRuleInput } from '@common/types'

interface ToolPermissionSettingsProps {
  className?: string
}

interface EditingRule extends Partial<CreateToolPermissionRuleInput> {
  id?: string
}

export function ToolPermissionSettings({
  className
}: ToolPermissionSettingsProps): React.JSX.Element {
  const [rules, setRules] = useState<ToolPermissionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingRule, setEditingRule] = useState<EditingRule | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadRules = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.backend.listToolPermissionRules()
      if (isOk(result)) {
        setRules(result.value)
      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : String(result.error)
        setError(errorMsg)
        logger.error('[ToolPermissionSettings] Failed to load rules', { error: result.error })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      logger.error('[ToolPermissionSettings] Error loading rules', { error: err })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const handleCreate = () => {
    setEditingRule({
      serverId: null,
      toolName: null,
      toolPattern: null,
      autoApprove: false,
      priority: 0
    })
    setIsCreating(true)
  }

  const handleEdit = (rule: ToolPermissionRule) => {
    setEditingRule({
      id: rule.id,
      serverId: rule.serverId,
      toolName: rule.toolName,
      toolPattern: rule.toolPattern,
      autoApprove: rule.autoApprove,
      priority: rule.priority
    })
    setIsCreating(false)
  }

  const handleCancel = () => {
    setEditingRule(null)
    setIsCreating(false)
  }

  const handleSave = async () => {
    if (!editingRule) return

    setSaving(true)
    setError(null)

    try {
      if (isCreating) {
        const input: CreateToolPermissionRuleInput = {
          serverId: editingRule.serverId || null,
          toolName: editingRule.toolName || null,
          toolPattern: editingRule.toolPattern || null,
          autoApprove: editingRule.autoApprove ?? false,
          priority: editingRule.priority ?? 0
        }
        const result = await window.backend.createToolPermissionRule(input)
        if (isOk(result)) {
          logger.info('[ToolPermissionSettings] Rule created', { rule: result.value })
        } else {
          const errorMsg = typeof result.error === 'string' ? result.error : String(result.error)
          setError(errorMsg)
          logger.error('[ToolPermissionSettings] Failed to create rule', { error: result.error })
          return
        }
      } else if (editingRule.id) {
        const result = await window.backend.updateToolPermissionRule(editingRule.id, {
          serverId: editingRule.serverId,
          toolName: editingRule.toolName,
          toolPattern: editingRule.toolPattern,
          autoApprove: editingRule.autoApprove,
          priority: editingRule.priority
        })
        if (isOk(result)) {
          logger.info('[ToolPermissionSettings] Rule updated', { rule: result.value })
        } else {
          const errorMsg = typeof result.error === 'string' ? result.error : String(result.error)
          setError(errorMsg)
          logger.error('[ToolPermissionSettings] Failed to update rule', { error: result.error })
          return
        }
      }

      setEditingRule(null)
      setIsCreating(false)
      await loadRules()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setError(null)
    try {
      const result = await window.backend.deleteToolPermissionRule(id)
      if (isOk(result)) {
        logger.info('[ToolPermissionSettings] Rule deleted', { id })
        await loadRules()
      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : String(result.error)
        setError(errorMsg)
        logger.error('[ToolPermissionSettings] Failed to delete rule', { error: result.error })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      logger.error('[ToolPermissionSettings] Error deleting rule', { error: err })
    }
  }

  const renderRuleForm = () => {
    if (!editingRule) return null

    return (
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-slate-900">
            {isCreating ? 'New Permission Rule' : 'Edit Rule'}
          </h4>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="serverId">Server ID</Label>
            <Input
              id="serverId"
              placeholder="Leave empty for all servers"
              value={editingRule.serverId || ''}
              onChange={(e) =>
                setEditingRule((prev) => ({
                  ...prev,
                  serverId: e.target.value || null
                }))
              }
            />
            <p className="text-xs text-slate-500">
              Match specific MCP server or leave empty for all
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              type="number"
              placeholder="0"
              value={editingRule.priority ?? 0}
              onChange={(e) =>
                setEditingRule((prev) => ({
                  ...prev,
                  priority: parseInt(e.target.value) || 0
                }))
              }
            />
            <p className="text-xs text-slate-500">Higher priority rules are evaluated first</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="toolName">Tool Name (Exact)</Label>
            <Input
              id="toolName"
              placeholder="e.g. read_file"
              value={editingRule.toolName || ''}
              onChange={(e) =>
                setEditingRule((prev) => ({
                  ...prev,
                  toolName: e.target.value || null
                }))
              }
            />
            <p className="text-xs text-slate-500">Exact tool name to match</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="toolPattern">Tool Pattern (Wildcard)</Label>
            <Input
              id="toolPattern"
              placeholder="e.g. delete_*"
              value={editingRule.toolPattern || ''}
              onChange={(e) =>
                setEditingRule((prev) => ({
                  ...prev,
                  toolPattern: e.target.value || null
                }))
              }
            />
            <p className="text-xs text-slate-500">Wildcard pattern (* matches any characters)</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Switch
            id="autoApprove"
            checked={editingRule.autoApprove ?? false}
            onCheckedChange={(checked) =>
              setEditingRule((prev) => ({ ...prev, autoApprove: checked }))
            }
          />
          <Label htmlFor="autoApprove" className="flex items-center gap-2">
            {editingRule.autoApprove ? (
              <>
                <ShieldCheck className="h-4 w-4 text-green-600" />
                Auto-approve matching tools
              </>
            ) : (
              <>
                <ShieldX className="h-4 w-4 text-amber-600" />
                Require approval for matching tools
              </>
            )}
          </Label>
        </div>
      </div>
    )
  }

  const renderRuleItem = (rule: ToolPermissionRule) => {
    const isEditing = editingRule?.id === rule.id && !isCreating

    if (isEditing) {
      return null // Form is rendered separately
    }

    return (
      <div
        key={rule.id}
        className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          {rule.autoApprove ? (
            <ShieldCheck className="h-5 w-5 text-green-600" />
          ) : (
            <ShieldX className="h-5 w-5 text-amber-600" />
          )}
          <div>
            <div className="flex items-center gap-2">
              {rule.serverId && (
                <Badge variant="outline" className="text-xs">
                  Server: {rule.serverId}
                </Badge>
              )}
              {rule.toolName && (
                <Badge variant="secondary" className="text-xs">
                  Tool: {rule.toolName}
                </Badge>
              )}
              {rule.toolPattern && (
                <Badge variant="secondary" className="text-xs font-mono">
                  Pattern: {rule.toolPattern}
                </Badge>
              )}
              {!rule.serverId && !rule.toolName && !rule.toolPattern && (
                <span className="text-sm text-slate-500 italic">All tools (default)</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span>Priority: {rule.priority}</span>
              <span>|</span>
              <span>{rule.autoApprove ? 'Auto-approve' : 'Requires approval'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(rule.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-600" />
            <CardTitle>Tool Permission Rules</CardTitle>
          </div>
          {!editingRule && (
            <Button size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Rule
            </Button>
          )}
        </div>
        <CardDescription>
          Configure which MCP tools require manual approval before execution. Rules are evaluated by
          priority (highest first), and the first matching rule determines the behavior.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-500">Loading rules...</span>
          </div>
        ) : (
          <>
            {editingRule && isCreating && renderRuleForm()}

            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id}>
                  {editingRule?.id === rule.id && !isCreating
                    ? renderRuleForm()
                    : renderRuleItem(rule)}
                </div>
              ))}
            </div>

            {rules.length === 0 && !editingRule && (
              <div className="text-center py-8 text-slate-500">
                <Shield className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No permission rules configured</p>
                <p className="text-sm mt-1">All tools will require manual approval by default.</p>
                <Button variant="outline" className="mt-4" onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-1" />
                  Create your first rule
                </Button>
              </div>
            )}
          </>
        )}

        <div className="p-3 bg-slate-50 rounded text-xs text-slate-600 space-y-2">
          <p className="font-semibold">How it works:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Rules are evaluated in priority order (highest first)</li>
            <li>The first matching rule determines whether approval is needed</li>
            <li>Tools with no matching rule require manual approval (safe default)</li>
            <li>
              Use patterns like <code className="bg-slate-200 px-1 rounded">delete_*</code> to match
              multiple tools
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
