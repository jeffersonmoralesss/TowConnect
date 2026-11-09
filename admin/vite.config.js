import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Driver app 5173, operator web app 5174, admin panel 5175: all three can run at once.
  // No --host here on purpose: the admin panel only needs to open on your own computer.
  server: { port: 5175 },
  preview: { port: 4175 },
})
