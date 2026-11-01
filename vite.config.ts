import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Re:chant beta GitHub Pages deployment.
// Use an explicit base path; no Node.js globals are required.
export default defineConfig({
  plugins: [react()],
  base: '/Re-chant-beta/',
  server: {
    port: 5173,
  },
});
