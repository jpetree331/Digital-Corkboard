import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5181, strictPort: true },
  // PGlite loads its WASM assets directly.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
});
