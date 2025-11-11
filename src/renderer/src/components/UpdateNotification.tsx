import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import type { UpdateInfo, UpdateProgressInfo, UpdateError } from '@common/types'

interface UpdateNotificationProps {
  // Optional: Allow parent component to control visibility
  disabled?: boolean
}

type UpdateState =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available'; info: UpdateInfo }
  | { type: 'downloading'; progress: UpdateProgressInfo }
  | { type: 'downloaded'; info: UpdateInfo }
  | { type: 'error'; error: UpdateError }

export function UpdateNotification({ disabled = false }: UpdateNotificationProps) {
  const [updateState, setUpdateState] = useState<UpdateState>({ type: 'idle' })
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (disabled) return

    // Listen for update events from main process
    const handleUpdateAvailable = (_event: unknown, info: UpdateInfo) => {
      console.log('[UpdateNotification] Update available:', info)
      setUpdateState({ type: 'available', info })
      setDialogOpen(true)
    }

    const handleUpdateDownloadProgress = (_event: unknown, progress: UpdateProgressInfo) => {
      console.log('[UpdateNotification] Download progress:', progress)
      setUpdateState({ type: 'downloading', progress })
    }

    const handleUpdateDownloaded = (_event: unknown, info: UpdateInfo) => {
      console.log('[UpdateNotification] Update downloaded:', info)
      setUpdateState({ type: 'downloaded', info })
      setDialogOpen(true)
    }

    const handleUpdateError = (_event: unknown, error: UpdateError) => {
      console.error('[UpdateNotification] Update error:', error)
      setUpdateState({ type: 'error', error })
      setDialogOpen(true)
    }

    // Register IPC event listeners (using electron's ipcRenderer via window.electron)
    window.electron.ipcRenderer.on('update-available', handleUpdateAvailable)
    window.electron.ipcRenderer.on('update-download-progress', handleUpdateDownloadProgress)
    window.electron.ipcRenderer.on('update-downloaded', handleUpdateDownloaded)
    window.electron.ipcRenderer.on('update-error', handleUpdateError)

    // Cleanup
    return () => {
      window.electron.ipcRenderer.removeListener('update-available', handleUpdateAvailable)
      window.electron.ipcRenderer.removeListener('update-download-progress', handleUpdateDownloadProgress)
      window.electron.ipcRenderer.removeListener('update-downloaded', handleUpdateDownloaded)
      window.electron.ipcRenderer.removeListener('update-error', handleUpdateError)
    }
  }, [disabled])

  const handleDownload = async () => {
    if (updateState.type !== 'available') return

    try {
      setUpdateState({ type: 'downloading', progress: { bytesPerSecond: 0, percent: 0, transferred: 0, total: 0 } })
      const result = await window.main.downloadUpdate()

      if (result.status === 'error') {
        setUpdateState({ type: 'error', error: { message: result.error as string } })
      }
    } catch (error) {
      console.error('[UpdateNotification] Failed to download update:', error)
      setUpdateState({ type: 'error', error: { message: error instanceof Error ? error.message : 'Unknown error' } })
    }
  }

  const handleInstall = async () => {
    if (updateState.type !== 'downloaded') return

    try {
      await window.main.quitAndInstall()
      // App will quit and install, so this won't be reached
    } catch (error) {
      console.error('[UpdateNotification] Failed to install update:', error)
      setUpdateState({ type: 'error', error: { message: error instanceof Error ? error.message : 'Unknown error' } })
    }
  }

  const handleDismiss = () => {
    setDialogOpen(false)
    setUpdateState({ type: 'idle' })
  }

  const handleDeferInstall = () => {
    setDialogOpen(false)
    // Keep the state as 'downloaded' so user can install later if needed
  }

  // Render different dialogs based on update state
  if (updateState.type === 'available') {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Available</DialogTitle>
            <DialogDescription>
              A new version ({updateState.info.version}) is available. Would you like to download it now?
            </DialogDescription>
          </DialogHeader>
          {updateState.info.releaseNotes && (
            <div className="mt-4 p-3 bg-gray-50 rounded text-sm text-gray-700 max-h-32 overflow-y-auto">
              <p className="font-medium mb-1">Release Notes:</p>
              <div className="whitespace-pre-wrap">{updateState.info.releaseNotes}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleDismiss}>
              Later
            </Button>
            <Button onClick={handleDownload}>
              Download Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  if (updateState.type === 'downloading') {
    return (
      <Dialog open={dialogOpen} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Downloading Update</DialogTitle>
            <DialogDescription>
              Please wait while the update is being downloaded...
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Progress</span>
              <span>{updateState.progress.percent.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${updateState.progress.percent}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {formatBytes(updateState.progress.transferred)} / {formatBytes(updateState.progress.total)}
              {updateState.progress.bytesPerSecond > 0 && (
                <> • {formatBytes(updateState.progress.bytesPerSecond)}/s</>
              )}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (updateState.type === 'downloaded') {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Ready</DialogTitle>
            <DialogDescription>
              Version {updateState.info.version} has been downloaded. Restart now to install the update?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleDeferInstall}>
              Later
            </Button>
            <Button onClick={handleInstall}>
              Restart Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  if (updateState.type === 'error') {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Error</DialogTitle>
            <DialogDescription>
              An error occurred while checking for updates.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 p-3 bg-red-50 rounded text-sm text-red-700">
            <p className="font-medium mb-1">Error Details:</p>
            <p>{updateState.error.message}</p>
            {updateState.error.code && <p className="text-xs mt-1">Code: {updateState.error.code}</p>}
          </div>
          <DialogFooter>
            <Button onClick={handleDismiss}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return null
}

// Utility function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
