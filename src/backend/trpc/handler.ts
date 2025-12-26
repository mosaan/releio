import { AnyRouter, TRPCError } from '@trpc/server'
import { getErrorShape } from '@trpc/server/shared'
import logger from '../logger'

const trpcLogger = logger.child('trpc')

/**
 * MessagePort用のtRPCハンドラー
 *
 * MessagePortから受信したtRPCリクエストを処理し、レスポンスを返す
 */
export function createMessagePortHandler(opts: { router: AnyRouter; port: any }) {
  const { router, port } = opts

  return async (messageEvent: Electron.MessageEvent) => {
    const message = messageEvent as unknown as MessageEvent
    const data = message.data

    // tRPCリクエストかどうかチェック
    if (!data || data.type !== 'trpc-request') {
      return
    }

    const { id, path, input } = data

    trpcLogger.info(`tRPC request: ${path}`, { id, input })

    try {
      // tRPC caller を作成してプロシージャを実行
      const caller = router.createCaller({})

      // Path を使って procedure を呼び出す
      const pathParts = path.split('.')
      let procedure: any = caller

      for (const part of pathParts) {
        procedure = procedure[part]
        if (!procedure) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Procedure ${path} not found`
          })
        }
      }

      const result = await procedure(input)

      // 成功レスポンスを返す
      port.postMessage({
        type: 'trpc-response',
        id,
        result: {
          type: 'data',
          data: result
        }
      })

      trpcLogger.info(`tRPC response: ${path}`, { id, success: true })
    } catch (cause) {
      // エラーレスポンスを返す
      const error = getErrorShape({
        config: router._def._config,
        error: cause instanceof TRPCError ? cause : new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: cause instanceof Error ? cause.message : 'Unknown error',
          cause
        }),
        type: 'query',
        path,
        input,
        ctx: {}
      })

      port.postMessage({
        type: 'trpc-response',
        id,
        result: {
          type: 'error',
          error
        }
      })

      trpcLogger.error(`tRPC error: ${path}`, { id, error })
    }
  }
}
