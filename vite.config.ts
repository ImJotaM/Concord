import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

const isHttps = process.env.HTTPS === 'true';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), tailwindcss(), ...(isHttps ? [basicSsl()] : [])],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: true, // Allow LAN devices (e.g. mobile phones) to connect directly in dev mode
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
});
