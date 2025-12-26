import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Server } from './server'
import logger from './logger'

function expose(name: string, data: unknown): void {
  // Use `contextBridge` APIs to expose Electron APIs to
  // renderer only if context isolation is enabled, otherwise
  // just add to the DOM global.
  if (process.contextIsolated) {
    try {
      contextBridge.exposeInMainWorld(name, data)
    } catch (error) {
      console.error(error)
    }
  } else {
    // @ts-ignore (define in dts)
    window[name] = data
  }
}

function main(): void {
  logger.info('Preload script started')

  expose('electron', electronAPI)
  const server = new Server()
  server.connectBackend()

  // Expose so that frontend can call to wait for backend
  // to connect, before calling any backend API to avoid
  // race condition.
  expose('connectBackend', () => {
    return server.connectBackend()
  })

  expose('main', server.mainAPI)
  expose('backend', server.backendAPI)

  // tRPC用にMessagePort APIをラップして公開
  // contextBridge経由ではMessagePortオブジェクトを直接渡せないため、
  // MessagePortの機能をラップした関数として公開する
  expose('trpcMessagePort', {
    postMessage: (data: unknown) => {
      const port = server.getMessagePort()
      if (!port) {
        throw new Error('MessagePort not connected')
      }
      port.postMessage(data)
    },
    onMessage: (callback: (data: unknown) => void) => {
      const port = server.getMessagePort()
      if (!port) {
        throw new Error('MessagePort not connected')
      }

      // MessagePortのAPIスタイルを判定してリスナーを追加
      const handler = (event: MessageEvent | any) => {
        // Web API MessageEventの場合は event.data、Node.js の場合は直接データ
        const data = 'data' in event ? event.data : event
        callback(data)
      }

      if ('addEventListener' in port) {
        port.addEventListener('message', handler)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(port as any).on('message', handler)
      }

      // クリーンアップ用の関数を返す
      return () => {
        if ('removeEventListener' in port) {
          port.removeEventListener('message', handler)
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(port as any).removeListener('message', handler)
        }
      }
    }
  })
}

main()
