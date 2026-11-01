import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Use the production repository path by default, while allowing
  // GitHub Actions to override it for the dedicated beta repository.
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    base: env.RECHANT_BASE_PATH || '/Re-chant/',
    server: {
      port: 5173,
    },
  };
});
