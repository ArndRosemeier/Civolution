import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: { port: 5173 },
  build: { target: 'es2023', chunkSizeWarningLimit: 2000 },
});
