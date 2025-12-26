import { initTRPC } from '@trpc/server'

/**
 * tRPC インスタンスの初期化
 */
const t = initTRPC.create()

/**
 * Backend tRPC Router
 *
 * MessagePort経由でRenderer Processから呼び出されるAPIを定義
 */
export const backendRouter = t.router({
  /**
   * Ping - シンプルな接続テスト
   *
   * @returns "pong" を返す
   * @example
   * ```typescript
   * const result = await trpc.ping.query()
   * console.log(result) // "pong"
   * ```
   */
  ping: t.procedure.query(() => {
    return 'pong'
  })
})

export type BackendRouter = typeof backendRouter
