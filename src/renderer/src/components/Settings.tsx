import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Trash2, FolderOpen, Wifi, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { isOk, isError } from '@common/result'
import { logger } from '@renderer/lib/logger'
import type { ConnectionTestResult } from '@common/types'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@renderer/components/ui/card'
import { AISettings } from './AISettings'
import { ProxySettings } from './ProxySettings'
import { CertificateSettings } from './CertificateSettings'

interface SettingsProps {
  onBack: () => void
}

export function Settings({ onBack }: SettingsProps): React.JSX.Element {
  const [isClearingDatabase, setIsClearingDatabase] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [databasePath, setDatabasePath] = useState<string>('')
  const [logPath, setLogPath] = useState<string>('')

  // Connection test state
  const [isTesting, setIsTesting] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)
  const [testError, setTestError] = useState(false)
  const [testMessage, setTestMessage] = useState<string>('')

  useEffect(() => {
    const loadPaths = async (): Promise<void> => {
      const [dbPathResult, logPathResult] = await Promise.all([
        window.backend.getDatabasePath(),
        window.backend.getLogPath()
      ])

      if (isOk(dbPathResult)) {
        setDatabasePath(dbPathResult.value)
      } else {
        logger.error('Failed to get database path:', dbPathResult.error)
      }

      if (isOk(logPathResult)) {
        setLogPath(logPathResult.value)
      } else {
        logger.error('Failed to get log path:', logPathResult.error)
      }

      if (isError(dbPathResult) || isError(logPathResult)) {
        setMessage({
          type: 'error',
          text: 'Failed to load some file paths'
        })
      }
    }

    loadPaths()
  }, [])

  const handleOpenFolder = async (folderPath: string): Promise<void> => {
    await window.main.openFolder(folderPath)
  }

  const PathDisplay = ({
    title,
    description,
    path
  }: {
    title: string
    description: string
    path: string
  }) => (
    <div>
      <h3 className="font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-3">{description}</p>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <code className="text-sm bg-gray-100 px-3 py-2 rounded border block truncate">
            {path || 'Path not available'}
          </code>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleOpenFolder(path)}
          disabled={!path}
          className="flex items-center gap-2 shrink-0"
        >
          <FolderOpen className="h-4 w-4" />
          Open Folder
        </Button>
      </div>
    </div>
  )

  const handleClearDatabase = async (): Promise<void> => {
    if (!confirm('Are you sure you want to clear the database?')) {
      return
    }

    setIsClearingDatabase(true)
    setMessage(null)

    const result = await window.backend.clearDatabase()

    if (isOk(result)) {
      setMessage({
        type: 'success',
        text: 'Database cleared successfully!'
      })
    } else {
      logger.error('Failed to clear database:', result.error)
      setMessage({
        type: 'error',
        text: 'Failed to clear database. Please try again.'
      })
    }

    setIsClearingDatabase(false)
  }

  const testConnection = useCallback(async (): Promise<void> => {
    setIsTesting(true)
    setTestSuccess(false)
    setTestError(false)
    setTestMessage('')

    logger.info('Testing network connection with current proxy and certificate settings')

    const result = await window.backend.testFullConnection()

    if (isOk(result)) {
      const testResult: ConnectionTestResult = result.value

      if (testResult.success) {
        setTestSuccess(true)
        const detailsStr = testResult.details?.responseTime
          ? ` (${testResult.details.responseTime}ms)`
          : ''
        setTestMessage(`${testResult.message}${detailsStr}`)
        logger.info('Connection test succeeded', { message: testResult.message })

        // Auto-clear success message after 5 seconds
        setTimeout(() => {
          setTestSuccess(false)
          setTestMessage('')
        }, 5000)
      } else {
        setTestError(true)
        let errorDetails = ''
        if (testResult.details) {
          const { errorType, statusCode, responseTime } = testResult.details
          if (errorType) errorDetails += `\nError type: ${errorType}`
          if (statusCode) errorDetails += `\nStatus code: ${statusCode}`
          if (responseTime) errorDetails += `\nResponse time: ${responseTime}ms`
        }
        setTestMessage(testResult.message + errorDetails)
        logger.error('Connection test failed', {
          message: testResult.message,
          details: testResult.details
        })

        // Auto-clear error message after 8 seconds
        setTimeout(() => {
          setTestError(false)
          setTestMessage('')
        }, 8000)
      }
    } else {
      setTestError(true)
      setTestMessage('Failed to perform connection test: ' + result.error)
      logger.error('Connection test request failed', { error: result.error })

      setTimeout(() => {
        setTestError(false)
        setTestMessage('')
      }, 8000)
    }

    setIsTesting(false)
  }, [])

  return (
    <div className="h-screen bg-gray-50 p-8 overflow-auto">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={onBack} disabled={isClearingDatabase}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-4xl font-bold text-gray-900">Settings</h1>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>File Locations</CardTitle>
              <CardDescription>
                View and access the folders where your application data and logs are stored.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <PathDisplay
                  title="Database Location"
                  description="Location where application data is stored"
                  path={databasePath}
                />
                <PathDisplay
                  title="Log Files Location"
                  description="Location where application log files are stored"
                  path={logPath}
                />
              </div>
            </CardContent>
          </Card>

          <AISettings className="shadow-sm" />

          <ProxySettings className="shadow-sm" />

          <CertificateSettings className="shadow-sm" />

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Network Connection Test</CardTitle>
              <CardDescription>
                Test your network connectivity with current proxy and certificate settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                This will verify that your proxy and certificate settings are working correctly by
                making a test connection to google.com.
              </p>
              <Button
                onClick={testConnection}
                disabled={isTesting}
                variant={testSuccess ? 'default' : testError ? 'destructive' : 'outline'}
                className={
                  testSuccess
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : testError
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : ''
                }
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : testSuccess ? (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Success
                  </>
                ) : testError ? (
                  <>
                    <XCircle className="mr-2 h-4 w-4" />
                    Failed
                  </>
                ) : (
                  <>
                    <Wifi className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>
              {testMessage && (
                <div
                  className={`mt-4 p-3 rounded text-sm ${
                    testSuccess
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-orange-50 text-orange-800 border border-orange-200 whitespace-pre-wrap'
                  }`}
                >
                  {testMessage}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-red-600">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions that will permanently modify your application data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Clear Database</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This will permanently delete all data from the database and close the application.
                  You will need to restart the application manually. This action cannot be undone.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                variant="destructive"
                onClick={handleClearDatabase}
                disabled={isClearingDatabase}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {isClearingDatabase ? 'Clearing...' : 'Clear Database'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {message && (
          <div
            className={`mt-6 p-4 rounded-md ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  )
}
