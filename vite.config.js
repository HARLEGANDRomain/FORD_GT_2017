import { defineConfig } from 'vite';

export default defineConfig({
  // './' → le build fonctionne depuis n'importe quel sous-dossier (GitHub Pages, portfolio…)
  base: './',
  build: { target: 'esnext', chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5173 },
});
