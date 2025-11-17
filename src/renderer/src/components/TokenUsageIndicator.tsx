import { useState, useEffect } from 'react'
import { Activity, Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import { isOk } from '@common/result'
import { logger } from '@renderer/lib/logger'
import type { TokenUsageInfo, AIModelSelection } from '@common/types'

interface TokenUsageIndicatorProps {
  sessionId: string | null | undefined
  modelSelection: AIModelSelection | null
}

export function TokenUsageIndicator({ sessionId, modelSelection }: TokenUsageIndicatorProps): React.JSX.Element | null {
  const [tokenUsage, setTokenUsage] = useState<TokenUsageInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch token usage periodically
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null

    const fetchTokenUsage = async (): Promise<void> => {
      if (!sessionId || !modelSelection) {
        setTokenUsage(null)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        // Get provider configuration to get provider type and model name
        const configResult = await window.backend.getProviderConfiguration(modelSelection.providerConfigId)
        if (!isOk(configResult) || !configResult.value) {
          setError('Provider configuration not found')
          return
        }

        const providerConfig = configResult.value
        const provider = providerConfig.type
        const model = modelSelection.modelId

        const result = await window.backend.getTokenUsage(sessionId, provider, model)

        if (isOk(result)) {
          setTokenUsage(result.value)
        } else {
          setError(`Failed to get token usage: ${result.error}`)
          logger.error('Failed to get token usage', { sessionId, error: result.error })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(`Error: ${message}`)
        logger.error('Error fetching token usage', { sessionId, error: err })
      } finally {
        setIsLoading(false)
      }
    }

    // Initial fetch
    fetchTokenUsage()

    // Poll every 3 seconds when there's an active session
    if (sessionId && modelSelection) {
      intervalId = setInterval(fetchTokenUsage, 3000)
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [sessionId, modelSelection])

  // Don't render if no session or model selected
  if (!sessionId || !modelSelection || error) {
    return null
  }

  // Don't render if still loading for the first time
  if (isLoading && !tokenUsage) {
    return null
  }

  // Don't render if no data
  if (!tokenUsage) {
    return null
  }

  // Format numbers with commas
  const formatNumber = (num: number): string => {
    return num.toLocaleString()
  }

  // Determine color based on utilization percentage
  const getColor = (): string => {
    const percentage = tokenUsage.utilizationPercentage
    if (percentage < 70) return 'text-green-600 dark:text-green-500'
    if (percentage < 90) return 'text-yellow-600 dark:text-yellow-500'
    if (percentage < 95) return 'text-orange-600 dark:text-orange-500'
    return 'text-red-600 dark:text-red-500'
  }

  // Determine background color for better visibility
  const getBgColor = (): string => {
    const percentage = tokenUsage.utilizationPercentage
    if (percentage < 70) return 'bg-green-50 dark:bg-green-950/30'
    if (percentage < 90) return 'bg-yellow-50 dark:bg-yellow-950/30'
    if (percentage < 95) return 'bg-orange-50 dark:bg-orange-950/30'
    return 'bg-red-50 dark:bg-red-950/30'
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getColor()} ${getBgColor()} border border-current/20`}>
            <Activity className="h-3 w-3" />
            <span className="hidden sm:inline">
              {formatNumber(tokenUsage.currentTokens)} / {formatNumber(tokenUsage.maxTokens)}
            </span>
            <span className="font-semibold">
              ({tokenUsage.utilizationPercentage.toFixed(1)}%)
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="p-3 max-w-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 shadow-lg"
        >
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
              <Info className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
              <span className="font-semibold text-gray-900 dark:text-gray-100">Token Usage Details</span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-gray-600 dark:text-gray-400">Input tokens:</span>
              <span className="font-medium text-right text-gray-900 dark:text-gray-100">{formatNumber(tokenUsage.inputTokens)}</span>

              <span className="text-gray-600 dark:text-gray-400">Output tokens:</span>
              <span className="font-medium text-right text-gray-900 dark:text-gray-100">{formatNumber(tokenUsage.outputTokens)}</span>

              <span className="text-gray-600 dark:text-gray-400">Estimated response:</span>
              <span className="font-medium text-right text-gray-900 dark:text-gray-100">{formatNumber(tokenUsage.estimatedResponseTokens)}</span>

              <span className="text-gray-600 dark:text-gray-400">Total usage:</span>
              <span className="font-medium text-right text-gray-900 dark:text-gray-100">{formatNumber(tokenUsage.currentTokens)}</span>
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Context limit:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatNumber(tokenUsage.maxTokens)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Utilization:</span>
                <span className={`font-semibold ${getColor()}`}>
                  {tokenUsage.utilizationPercentage.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Threshold:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{tokenUsage.thresholdPercentage.toFixed(0)}%</span>
              </div>
            </div>

            {tokenUsage.needsCompression && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-orange-600 dark:text-orange-500 font-medium">
                  ⚠️ Compression recommended
                </span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
