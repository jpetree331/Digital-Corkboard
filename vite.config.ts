import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { apiPlugin } from './server/devPlugin';
export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: { port: 5181, strictPort: true },
});
