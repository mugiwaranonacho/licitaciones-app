import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/mercadopublico': {
          target: 'https://api.mercadopublico.cl',
          changeOrigin: true,
          rewrite: (path) => {
            const url = new URL(path, 'http://localhost')
            const endpoint = url.searchParams.get('endpoint')
            const ticket = env.VITE_API_KEY
            url.searchParams.delete('endpoint')
            url.searchParams.set('ticket', ticket)
            const qs = url.searchParams.toString()
            if (endpoint === 'licitaciones') return `/servicios/v1/publico/licitaciones.json?${qs}`
            if (endpoint === 'ordenesdecompra') return `/servicios/v1/publico/ordenesdecompra.json?${qs}`
            return path
          }
        }
      }
    }
  }
})