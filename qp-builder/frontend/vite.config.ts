import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envDir: '..',   // read VITE_* vars from the root .env alongside server config
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:5050',
    },
  },
})
