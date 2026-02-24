import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/gps': {
        target: 'https://www.stops.lt',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gps/, '/vilnius/gps.txt'),
      },
      '/api/route': {
        target: 'https://www.stops.lt',
        changeOrigin: true,
        rewrite: () => '/vilnius/vilnius/vilnius_bus_117.txt',
      },
    },
  },
})
