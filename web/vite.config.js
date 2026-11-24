import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em desenvolvimento, as chamadas para /api vão para a API local.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
