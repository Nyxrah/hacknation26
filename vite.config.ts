import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Te same ścieżki proxy co w server.mjs (produkcja) — usługi bez nagłówków CORS.
const proxy = (target: string, prefix: string) => ({
  target: new URL(target).origin,
  changeOrigin: true,
  secure: true,
  timeout: 240000,
  proxyTimeout: 240000,
  headers: { 'User-Agent': 'bank-wody/1.0 (prototyp HackNation)' },
  rewrite: (p: string) => p.replace(prefix, new URL(target).pathname.replace(/\/$/, '')),
})

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/proxy/nmt': proxy('https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF', '/proxy/nmt'),
      '/proxy/cop': proxy('https://copernicus-dem-30m.s3.amazonaws.com/', '/proxy/cop'),
      '/proxy/overpass': proxy('https://overpass-api.de/api/interpreter', '/proxy/overpass'),
      '/proxy/meteo': proxy('https://archive-api.open-meteo.com/v1/archive', '/proxy/meteo'),
    },
  },
})
