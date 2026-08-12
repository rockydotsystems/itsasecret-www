import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Same '~' alias as vite.config.ts, so tests can import route handlers and
  // other modules that use it.
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
  },
})
