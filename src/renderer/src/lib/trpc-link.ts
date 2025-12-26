import { TRPCClientError, TRPCLink } from '@trpc/client'
import { AnyRouter } from '@trpc/server'
import { observable } from '@trpc/server/observable'

/**
 * MessagePort用のカスタムtRPCリンク
 *
 * Backend ProcessとMessagePort経由で通信するためのtRPCリンク
 */
export function createMessagePortLink<TRouter extends AnyRouter>(opts: {
  getMessagePort: () => MessagePort | null
}): TRPCLink<TRouter> {
  const { getMessagePort } = opts

  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const port = getMessagePort()

        if (!port) {
          observer.error(
            new TRPCClientError('MessagePort not connected')
          )
          return
        }

        // デバッグ: MessagePort の型を確認
        console.log('[tRPC Link] MessagePort type:', {
          hasAddEventListener: 'addEventListener' in port,
          hasOn: 'on' in port,
          constructor: port.constructor.name,
          methods: Object.getOwnPropertyNames(Object.getPrototypeOf(port))
        })

        const requestId = Math.random().toString(36).substring(2, 15)

        // レスポンスリスナーを設定
        // Web MessagePort と Node.js MessagePortMain の両方に対応
        const handleMessage = (event: MessageEvent) => {
          const data = event.data

          if (data.type === 'trpc-response' && data.id === requestId) {
            // リスナーを削除
            if ('removeEventListener' in port) {
              port.removeEventListener('message', handleMessage)
            } else {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(port as any).removeListener('message', handleMessage)
            }

            if (data.result.type === 'data') {
              observer.next({
                result: {
                  data: data.result.data
                }
              })
              observer.complete()
            } else if (data.result.type === 'error') {
              observer.error(
                TRPCClientError.from({
                  ...data.result.error,
                  message: data.result.error.message
                })
              )
            }
          }
        }

        // リスナーを追加
        if ('addEventListener' in port) {
          port.addEventListener('message', handleMessage)
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(port as any).on('message', handleMessage)
        }

        // tRPCリクエストを送信
        port.postMessage({
          type: 'trpc-request',
          id: requestId,
          path: op.path,
          input: op.input
        })

        // クリーンアップ
        return () => {
          if ('removeEventListener' in port) {
            port.removeEventListener('message', handleMessage)
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(port as any).removeListener('message', handleMessage)
          }
        }
      })
    }
  }
}
