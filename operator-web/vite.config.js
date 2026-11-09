import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // A different port from the driver app (5173), so you can run both at once.
  server: { port: 5174 },
  preview: { port: 4174 },
})
