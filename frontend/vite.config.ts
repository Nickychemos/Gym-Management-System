import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The Frappe app package lives one level up from frontend/.
const appDir = path.resolve(__dirname, '../gym_management')

// After bundling, copy the built index.html into the app's www/ folder so
// Frappe serves the SPA at /gym and Jinja-renders the CSRF snippet inside it.
// (Assets themselves are served statically from /assets/gym_management/frontend/.)
function copyHtmlToWww() {
  return {
    name: 'gym-copy-html-to-www',
    closeBundle() {
      const src = path.join(appDir, 'public/frontend/index.html')
      const destDir = path.join(appDir, 'www')
      const dest = path.join(destDir, 'gym.html')
      fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(src, dest)
      // eslint-disable-next-line no-console
      console.log(`[gym] copied ${src} -> ${dest}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Production build: Frappe serves built assets from /assets/<app>/frontend/.
  // Dev: keep root so the Vite dev server works at http://localhost:5173/gym.
  base: command === 'build' ? '/assets/gym_management/frontend/' : '/',
  plugins: [react(), tailwindcss(), copyHtmlToWww()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    // Output into the Frappe app so `bench build` picks it up.
    outDir: path.join(appDir, 'public/frontend'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy Frappe API calls during dev so cookies + CORS just work
      '/api': {
        target: 'http://internal-app.localhost:8000',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
      '/assets': 'http://internal-app.localhost:8000',
      '/files': 'http://internal-app.localhost:8000',
    },
  },
}))
