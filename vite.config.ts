import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const repoBase = process.env.GITHUB_PAGES_BASE || '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: repoBase,
})
