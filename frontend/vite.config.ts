import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Собираем прямо в ../public — server.js раздаёт эту папку как раньше,
// про сборку ничего не знает. base:'./' — относительные пути к бандлу,
// чтобы работало под любым BASE_PATH без пересборки (см. __BASE__ в index.html).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/images': 'http://localhost:3000',
    },
  },
});
