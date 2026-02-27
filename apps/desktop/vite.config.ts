import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // Electron main process entry
        entry: 'electron/main.ts',
        // Bake the project root path into the production bundle so the packaged
        // app can locate the Python backend at D:\Telegram-Task-Filter\
        vite: {
          define: {
            __PROJECT_ROOT__: JSON.stringify(path.resolve(__dirname, '../..')),
          },
        },
      },
      preload: {
        // Preload script (runs in renderer context with Node access)
        input: 'electron/preload.ts',
      },
      // In dev mode, renderer loads from Vite dev server.
      // In production, it loads from dist/index.html.
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
