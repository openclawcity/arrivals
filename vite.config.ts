import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // The embedded-browser budget (plan §7.2) is ~2 MB gz first interaction.
    // three.js dominates; keep everything else lean and let rollup split it.
    chunkSizeWarningLimit: 1200,
  },
});
