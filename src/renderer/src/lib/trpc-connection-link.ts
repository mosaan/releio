import { TRPCClientError, TRPCLink } from '@trpc/client'
import { AnyRouter } from '@trpc/server'
import { observable } from '@trpc/server/observable'
import { isOk } from '@common/result'

/**
 * Connection ベースの tRPC リンク
 *
 * contextBridge 経由では MessagePort を直接渡せないため、
 * 既存の Connection クラスの invoke メソッドを使って通信する
 */
export function createConnectionLink<TRouter extends AnyRouter>(): TRPCLink<TRouter> {
  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const executeRequest = async () => {
          try {
            // Connection の invoke メソッドを使って tRPC リクエストを送信
            const result = await window.backend.invokeTRPC({
              path: op.path,
              input: op.input,
              type: op.type
            })

            if (isOk(result)) {
              observer.next({
                result: {
                  data: result.value
                }
              })
              observer.complete()
            } else {
              observer.error(
                new TRPCClientError(
                  typeof result.error === 'string' ? result.error : result.error.toString()
                )
              )
            }
          } catch (error) {
            observer.error(
              error instanceof TRPCClientError
                ? error
                : new TRPCClientError(
                    error instanceof Error ? error.message : 'Unknown error'
                  )
            )
          }
        }

        executeRequest()

        // クリーンアップは不要（invoke は一度きりの呼び出し）
        return () => {}
      })
    }
  }
}
