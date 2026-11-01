import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:process.env.RECHANT_BASE_PATH || '/Re-chant/',server:{port:5173}});
