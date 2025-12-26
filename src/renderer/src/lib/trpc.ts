import { createTRPCProxyClient } from '@trpc/client'
import type { BackendRouter } from '../../../backend/trpc/router'
import { createMessagePortLink } from './trpc-messageport-link'

/**
 * tRPC Client (Backend API)
 *
 * MessagePort経由でBackend ProcessのtRPC APIを呼び出す
 *
 * contextBridge経由ではMessagePortオブジェクトを直接渡せないため、
 * preloadでラップされたMessagePort APIを使用する
 *
 * @example
 * ```typescript
 * const result = await trpc.ping.query()
 * console.log(result) // "pong"
 * ```
 */
export const trpc = createTRPCProxyClient<BackendRouter>({
  links: [createMessagePortLink()]
})
