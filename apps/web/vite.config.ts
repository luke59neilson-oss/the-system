import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverPort = process.env['PORT'] ?? '30333';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${serverPort}`,
      '/health': `http://127.0.0.1:${serverPort}`,
      '/ws': { target: `ws://127.0.0.1:${serverPort}`, ws: true },
    },
  },
});
