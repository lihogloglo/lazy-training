import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/lazy-training/',
  define: {
    '__firebase_config': JSON.stringify(process.env.VITE_FIREBASE_CONFIG || '{}'),
    '__app_id': JSON.stringify(process.env.VITE_APP_ID || 'lazy-training-app'),
    '__initial_auth_token': 'null'
  }
})
