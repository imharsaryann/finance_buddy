import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-surbhi.svg'],
      manifest: {
        name: 'Surbhi Telecom',
        short_name: 'Surbhi',
        description: 'Wealth & Business Management',
        theme_color: '#F7F4EE',
        background_color: '#F7F4EE',
        display: 'standalone',
        icons: [
          {
            src: '/logo-surbhi.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1600
  }
})
