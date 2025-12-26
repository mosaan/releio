import { Connection } from '@common/connection'
import type { MessagePortMain } from 'electron'
import type { BackendMainAPI, MCPServerStatus } from '@common/types'
import { EventType } from '@common/types'
import { Handler } from './handler'
import logger from './logger'
import { db, runMigrations, ensureConnection } from './db'
import { mcpManager } from './mcp'
import { backendRouter } from './trpc/router'
import { createMessagePortHandler } from './trpc/handler'

/**
 * This class encapsulate the main logic of the backend thread.
 * It keeps 2 state:
 *
 *  1. A single connection to the main thread
 *  2. A list of connections to renderers
 */
export class Server {
  private _mainConnection: Connection
  private _rendererConnections: Connection[] = []

  constructor(parentPort: Electron.ParentPort) {
    this._mainConnection = new Connection(parentPort)
  }

  async init(): Promise<void> {
    await ensureConnection(db)
    await runMigrations(db)

    // Initialize MCP Manager - auto-starts enabled servers
    await mcpManager.initialize()

    mcpManager.onStatusChange((status) => {
      this._publishMcpStatus(status)
    })
  }

  /**
   * Connect a renderer's port and setup listeners to handle all invoke request
   * coming from that renderer.
   */
  connectRenderer(port: MessagePortMain): Connection {
    const connection = new Connection(port)
    this._rendererConnections.push(connection)

    const handler = new Handler({ rendererConnetion: connection })
    connection.handleAll(async (channel: string, args: unknown[]) => {
      const channelHandler = handler[channel]
      const result = await channelHandler.apply(handler, args)
      return result
    })

    // tRPCハンドラーを追加（MessagePort経由のtRPCリクエストを処理）
    const trpcHandler = createMessagePortHandler({ router: backendRouter, port })
    port.on('message', trpcHandler)

    logger.info('Renderer Connected (with tRPC support)')

    // Send current MCP statuses so renderer has an immediate snapshot
    for (const status of mcpManager.getAllServerStatuses()) {
      connection.publishEvent('mcpServerStatusChanged', {
        type: EventType.Status,
        payload: status
      })
    }

    return connection
  }

  private _invokeMain(channel: string, ...args: unknown[]) {
    return this._mainConnection.invoke(channel, ...args)
  }

  get mainAPI(): BackendMainAPI {
    return {
      osEncrypt: (...args) => this._invokeMain('osEncrypt', ...args),
      osDecrypt: (...args) => this._invokeMain('osDecrypt', ...args)
    }
  }

  private _publishMcpStatus(status: MCPServerStatus): void {
    const event = {
      type: EventType.Status,
      payload: status
    }

    for (const connection of this._rendererConnections) {
      if (connection?.isConnected()) {
        connection.publishEvent('mcpServerStatusChanged', event)
      }
    }
  }
}
