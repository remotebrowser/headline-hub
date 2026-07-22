import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    assetsDir: 'static-assets',
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.API_BASE_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    allowedHosts: true,
  },
});
