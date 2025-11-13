import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'renderer',
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup-renderer.ts'],
    include: ['tests/renderer/**/*.test.{ts,tsx}']
  },
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, './src/renderer/src'),
      '@common': path.resolve(__dirname, './src/common')
    }
  }
})
