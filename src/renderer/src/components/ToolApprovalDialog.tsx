import { useState } from 'react'
import { Shield, ShieldCheck, ShieldX, Loader2, Terminal } from 'lucide-react'
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
import { Badge } from '@renderer/components/ui/badge'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'
import type { ToolApprovalRequestPayload } from '@common/types'

interface ToolApprovalDialogProps {
  open: boolean
  request: ToolApprovalRequestPayload | null
  onApprove: () => void
  onDecline: (reason?: string) => void
}

export function ToolApprovalDialog({
  open,
  request,
  onApprove,
  onDecline
}: ToolApprovalDialogProps): React.JSX.Element {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleApprove = async (): Promise<void> => {
    if (!request) return

    try {
      setIsProcessing(true)
      setError(null)

      const result = await window.backend.approveToolCall(request.runId, request.toolCallId)

      if (isOk(result)) {
        logger.info('[ToolApproval] Approved', {
          runId: request.runId,
          toolCallId: request.toolCallId,
          toolName: request.toolName
        })
        onApprove()
      } else {
        setError(`Failed to approve: ${result.error}`)
        logger.error('[ToolApproval] Approve failed', { error: result.error })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(`Error: ${message}`)
      logger.error('[ToolApproval] Error during approval', { error: err })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDecline = async (): Promise<void> => {
    if (!request) return

    try {
      setIsProcessing(true)
      setError(null)

      const result = await window.backend.declineToolCall(
        request.runId,
        request.toolCallId,
        'User declined'
      )

      if (isOk(result)) {
        logger.info('[ToolApproval] Declined', {
          runId: request.runId,
          toolCallId: request.toolCallId,
          toolName: request.toolName
        })
        onDecline('User declined')
      } else {
        setError(`Failed to decline: ${result.error}`)
        logger.error('[ToolApproval] Decline failed', { error: result.error })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(`Error: ${message}`)
      logger.error('[ToolApproval] Error during decline', { error: err })
    } finally {
      setIsProcessing(false)
    }
  }

  // Format input for display
  const formatInput = (input: unknown): string => {
    if (input === null || input === undefined) return '(no input)'
    if (typeof input === 'string') return input
    try {
      return JSON.stringify(input, null, 2)
    } catch {
      return String(input)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={() => {}}>
      <AlertDialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-100">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-slate-100">
            <Shield className="h-5 w-5 text-amber-500" />
            Tool Execution Approval
          </AlertDialogTitle>
          <AlertDialogDescription className="text-slate-400">
            An AI tool is requesting permission to execute. Please review and approve or decline.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {request && (
          <div className="py-4 space-y-4">
            {/* Tool Info */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="h-4 w-4 text-indigo-400" />
                <span className="font-medium text-slate-200">Tool</span>
                <Badge variant="outline" className="border-indigo-500/50 text-indigo-300">
                  {request.toolName}
                </Badge>
              </div>

              {request.serverId && request.serverId !== 'unknown' && (
                <div className="text-xs text-slate-500 mb-2">Server: {request.serverId}</div>
              )}

              {/* Input Preview */}
              <div className="mt-3">
                <div className="text-xs text-slate-500 mb-1">Input:</div>
                <pre className="bg-slate-950/50 rounded p-2 text-xs text-slate-300 overflow-auto max-h-32 border border-slate-800">
                  {formatInput(request.input)}
                </pre>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 text-xs text-amber-400/80 bg-amber-500/10 p-3 rounded border border-amber-500/20">
              <Shield className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                This tool will execute with the parameters shown above. Make sure you trust this
                operation before approving.
              </span>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel
            onClick={handleDecline}
            disabled={isProcessing}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldX className="mr-2 h-4 w-4" />
            )}
            Decline
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleApprove}
            disabled={isProcessing}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Approve
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
