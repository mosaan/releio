import { AsyncLocalStorage } from 'node:async_hooks'

export const sessionContext = new AsyncLocalStorage<{ sessionId: string; streamId: string }>()
