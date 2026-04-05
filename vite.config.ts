import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { vitePrerenderPlugin } from 'vite-prerender-plugin'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

const repoBase = process.env.GITHUB_PAGES_BASE || '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    vitePrerenderPlugin({
      renderTarget: '#root',
      prerenderScript: path.resolve(rootDir, 'src/prerender.tsx'),
    }),
  ],
  base: repoBase,
})
