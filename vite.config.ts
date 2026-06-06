import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: https://wonseop-kdn.github.io/ems-simul/
export default defineConfig({
  base: '/ems-simul/',
  plugins: [react()],
});
