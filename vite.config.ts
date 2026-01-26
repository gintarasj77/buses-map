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
        rewrite: (path) => {
          const url = new URL(path, 'http://dummy')
          const pathParts = url.pathname.split('/')
          const busRaw = (pathParts[pathParts.length - 1] || '117').replace(/[^0-9a-zA-Z_-]/g, '') || '117'
          const bus = busRaw.toLowerCase()
          const mode = parseInt(url.searchParams.get('mode') || '0')
          
          if (mode === 1) {
            return `/vilnius/vilnius/vilnius_trol_${bus}.txt`
          } else if (/g/.test(bus)) {
            return `/vilnius/vilnius/vilnius_expressbus_${bus}.txt`
          }
          return `/vilnius/vilnius/vilnius_bus_${bus}.txt`
        },
      },
    },
  },
})
