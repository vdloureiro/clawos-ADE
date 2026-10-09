import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    // O SDK do ACP é só ESM; embutimos no bundle em vez de dar require() em runtime.
    plugins: [externalizeDepsPlugin({ exclude: ['@agentclientprotocol/sdk'] })],
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          agentHost: resolve('src/main/agents/agentHost.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
  },
  renderer: {
    resolve: {
      alias: { ...shared, '@': resolve('src/renderer') },
    },
    plugins: [react(), tailwindcss()],
  },
})
