import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envDir: '../',   // read from qp-builder/.env instead of frontend/.env
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:5050',
    },
  },
})
