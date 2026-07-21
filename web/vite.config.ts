import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Cloudflare Worker assets root'tan servis edilir. GitHub Pages workflow'u repo
// adini VITE_BASE_PATH ile verir; boylece yeni repo adinda asset yollari kirilmaz.
export default defineConfig({
  base: process.env.VITE_BASE_PATH?.trim() || '/',
  plugins: [react(), tailwindcss()],
});
