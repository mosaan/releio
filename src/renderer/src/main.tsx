import './assets/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { logger } from './lib/logger'

logger.info('🎨 Renderer process started')

// Backend接続を確立
window.connectBackend().then(() => {
  logger.info('Backend connection established for tRPC')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
