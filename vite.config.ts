import { defineConfig } from 'vite';

export default defineConfig({
  // Works at both a domain root and a GitHub Pages repository subdirectory.
  base: './',
  optimizeDeps: { entries: ['index.html'] },
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  build: { target: 'es2023' },
});
