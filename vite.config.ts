import path from 'path'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
})
