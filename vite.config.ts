import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    base: env.RECHANT_BASE_PATH || '/Re-chant-beta/',
    server: {
      port: 5173,
    },
  };
});
