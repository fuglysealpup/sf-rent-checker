import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Relative base so the build works from any path (GitHub Pages project sites included).
export default defineConfig({
  base: './',
  plugins: [react()],
})
