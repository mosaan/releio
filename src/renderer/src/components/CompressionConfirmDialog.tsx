import { useState, useEffect } from 'react'
import { Archive, Loader2, AlertCircle, TrendingDown } from 'lucide-react'
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
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'
import type { CompressionPreview, CompressionResult, AIModelSelection } from '@common/types'

interface CompressionConfirmDialogProps {
  open: boolean
  sessionId: string
  modelSelection: AIModelSelection
  apiKey: string
  onConfirm: (result: CompressionResult) => void
  onCancel: () => void
}

export function CompressionConfirmDialog({
  open,
  sessionId,
  modelSelection,
  apiKey,
  onConfirm,
  onCancel
}: CompressionConfirmDialogProps): React.JSX.Element {
  const [preview, setPreview] = useState<CompressionPreview | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isCompressing, setIsCompressing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load preview when dialog opens
  useEffect(() => {
    if (!open) {
      setPreview(null)
      setError(null)
      return
    }

    const loadPreview = async (): Promise<void> => {
      try {
        setIsLoadingPreview(true)
        setError(null)

        // Get provider configuration
        const configResult = await window.backend.getProviderConfiguration(
          modelSelection.providerConfigId
        )
        if (!isOk(configResult) || !configResult.value) {
          setError('Provider configuration not found')
          return
        }

        const providerConfig = configResult.value
        const provider = providerConfig.type
        const model = modelSelection.modelId

        const result = await window.backend.getCompressionPreview(sessionId, provider, model)

        if (isOk(result)) {
          setPreview(result.value)
        } else {
          setError(`Failed to get preview: ${result.error}`)
          logger.error('Failed to get compression preview', { sessionId, error: result.error })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(`Error: ${message}`)
        logger.error('Error loading compression preview', { sessionId, error: err })
      } finally {
        setIsLoadingPreview(false)
      }
    }

    loadPreview()
  }, [open, sessionId, modelSelection])

  const handleCompress = async (): Promise<void> => {
    try {
      setIsCompressing(true)
      setError(null)

      // Get provider configuration
      const configResult = await window.backend.getProviderConfiguration(
        modelSelection.providerConfigId
      )
      if (!isOk(configResult) || !configResult.value) {
        setError('Provider configuration not found')
        return
      }

      const providerConfig = configResult.value
      const provider = providerConfig.type
      const model = modelSelection.modelId

      const result = await window.backend.compressConversation(
        sessionId,
        provider,
        model,
        apiKey,
        true // force compression
      )

      if (isOk(result)) {
        logger.info('Compression completed', { sessionId, result: result.value })
        onConfirm(result.value)
      } else {
        setError(`Compression failed: ${result.error}`)
        logger.error('Compression failed', { sessionId, error: result.error })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(`Error: ${message}`)
      logger.error('Error during compression', { sessionId, error: err })
    } finally {
      setIsCompressing(false)
    }
  }

  const formatNumber = (num: number): string => {
    return num.toLocaleString()
  }

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Compress Conversation
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will summarize older messages to free up context space for new messages.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          {isLoadingPreview ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="p-3 rounded bg-red-50 text-red-800 border border-red-200 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : preview && preview.canCompress ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Current Tokens
                  </div>
                  <div className="text-lg font-semibold">{formatNumber(preview.currentTokens)}</div>
                </div>
                <div className="bg-green-50 dark:bg-green-950/30 p-3 rounded">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">After Compression</div>
                  <div className="text-lg font-semibold text-green-700 dark:text-green-400">
                    {formatNumber(preview.expectedNewTokens)}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-300">
                    Compression Details
                  </span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-400">Messages to compress:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-300">
                      {preview.messagesToCompress}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-400">Token savings:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-300">
                      {formatNumber(preview.tokenSavings)} ({preview.savingsPercentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : preview && !preview.canCompress ? (
            <div className="p-3 rounded bg-yellow-50 text-yellow-800 border border-yellow-200 text-sm">
              {preview.reason || 'Compression is not available at this time'}
            </div>
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isCompressing}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCompress}
            disabled={isLoadingPreview || isCompressing || !preview?.canCompress || !!error}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isCompressing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Compressing...
              </>
            ) : (
              <>
                <Archive className="mr-2 h-4 w-4" />
                Compress
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
