import { Server } from './server'
import logger from './logger'

async function main(): Promise<void> {
  logger.info('Backend process started')
  const server = new Server(process.parentPort)

  process.parentPort.on('message', (e) => {
    if (!e.data.channel && e.data.message) throw new Error('Malformatted message')

    if (e.data.channel === 'connectRenderer') {
      const [port] = e.ports
      server.connectRenderer(port)
      process.parentPort.postMessage({
        data: { channel: 'rendererConnected', message: e.data.message }
      })
    }
  })

  await server.init()
  logger.info('Backend process initialized successfully')
}

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('FATAL: Uncaught exception in backend process:', error)
  logger.error('Uncaught exception', { error: error.message, stack: error.stack })
  process.exit(1)
})

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('FATAL: Unhandled promise rejection in backend process:', reason)
  logger.error('Unhandled rejection', { reason, promise })
  process.exit(1)
})

main().catch((error) => {
  console.error('FATAL: Error in main():', error)
  logger.error('Failed to start backend', { error: error.message, stack: error.stack })
  process.exit(1)
})
