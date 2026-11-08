import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // MapLibre contains its worker and is fetched separately from the reading shell.
    chunkSizeWarningLimit: 1200,
  },
})
