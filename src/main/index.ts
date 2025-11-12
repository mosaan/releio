import { app, BrowserWindow } from 'electron'
import logger, { initializeLogging } from './logger'
import { Server } from './server'

function main() {
  let server: Server

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.whenReady().then(() => {
    // Initialize logging after app is ready
    initializeLogging()
    logger.info('Main process started')

    // Set app user model id for windows
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.electron-ai-starter')
    }

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    app.on('browser-window-created', (_, window) => {
      if (process.env.NODE_ENV === 'development') {
        window.webContents.on('before-input-event', (event, input) => {
          if (input.key === 'F12') {
            window.webContents.toggleDevTools()
            event.preventDefault()
          }
        })
      } else {
        window.webContents.on('before-input-event', (event, input) => {
          if (input.control && input.key === 'r') {
            event.preventDefault()
          }
        })
      }
    })

    // Setup main process server (handles backend and windows)
    server = new Server()
    server.createMainWindow()

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) server!.createMainWindow()
    })
  })

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', async (event) => {
    // Allow updater to quit and install without interference
    if (server?.getUpdater().isQuittingToInstall()) {
      logger.info('before-quit: Updater is installing, allowing quit')
      return
    }

    logger.info('before-quit: Shutting down gracefully')
    event.preventDefault()
    await server!.shutdown()
    app.exit(0)
  })
}

main()
