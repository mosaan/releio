import type { RendererMainAPI, RendererBackendAPI, BackendListenerAPI } from '@common/types'

declare global {
  interface Window {
    electron: typeof import('@electron-toolkit/preload').electronAPI
    connectBackend: () => Promise<void>
    main: RendererMainAPI
    backend: RendererBackendAPI & BackendListenerAPI
    trpcMessagePort: {
      postMessage: (data: unknown) => void
      onMessage: (callback: (data: unknown) => void) => () => void
    }
    // デバッグ用（後で削除予定）
    getBackendMessagePort: () => MessagePort | null
  }
}

export {}
