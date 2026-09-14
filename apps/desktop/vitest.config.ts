import { defineConfig } from 'vitest/config'
import path from 'path'

// Deliberately not reusing vite.config.ts: that one starts the Electron
// plugin, which has no place in a unit test run.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
