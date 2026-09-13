import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'

/** Backend sidecar; the renderer talks to it over HTTP and a WebSocket. */
const API = 'http://localhost:8787 ws://localhost:8787'
/** UpdateModal reads release notes straight from the GitHub API. */
const GITHUB = 'https://api.github.com'
/** Vite dev server, including its HMR socket. */
const VITE_DEV = 'http://localhost:5173 ws://localhost:5173'

/**
 * Content-Security-Policy as a meta tag in index.html.
 *
 * A meta tag rather than an onHeadersReceived hook because the packaged app
 * loads the page from file://, where response headers do not apply.
 *
 * 'unsafe-inline' for styles is required: framer-motion animates by writing
 * style attributes, and Vite injects <style> blocks in dev.
 *
 * Scripts get 'unsafe-inline' in dev only, because @vitejs/plugin-react
 * injects the React Refresh preamble as an inline script; without it the app
 * does not mount under `npm run dev`. The shipped policy has no such
 * exemption — verified by loading the built page with zero violations.
 */
function csp(): Plugin {
  return {
    name: 'inject-csp',
    transformIndexHtml(html, ctx) {
      const dev = !!ctx.server
      const policy = [
        "default-src 'self'",
        `script-src 'self'${dev ? ` 'unsafe-inline' ${VITE_DEV}` : ''}`,
        `style-src 'self' 'unsafe-inline'${dev ? ` ${VITE_DEV}` : ''}`,
        `connect-src 'self' ${API} ${GITHUB}${dev ? ` ${VITE_DEV}` : ''}`,
        "img-src 'self' data:",
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        "frame-src 'none'",
      ].join('; ')
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      )
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    csp(),
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
