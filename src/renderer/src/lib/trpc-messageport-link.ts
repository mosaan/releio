import { TRPCClientError, TRPCLink } from '@trpc/client'
import { AnyRouter } from '@trpc/server'
import { observable } from '@trpc/server/observable'

/**
 * MessagePort経由のtRPCリンク（contextBridge対応版）
 *
 * contextBridge経由ではMessagePortオブジェクトを直接渡せないため、
 * preloadでラップされたMessagePort APIを使用する
 */
export function createMessagePortLink<TRouter extends AnyRouter>(): TRPCLink<TRouter> {
  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const requestId = Math.random().toString(36).substring(2, 15)

        // レスポンスリスナーを設定
        const cleanup = window.trpcMessagePort.onMessage((data: any) => {
          if (data.type === 'trpc-response' && data.id === requestId) {
            // リスナーをクリーンアップ
            cleanup()

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
        })

        // tRPCリクエストを送信
        window.trpcMessagePort.postMessage({
          type: 'trpc-request',
          id: requestId,
          path: op.path,
          input: op.input
        })

        // クリーンアップ関数を返す
        return cleanup
      })
    }
  }
}
