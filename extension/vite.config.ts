import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const port = Number(process.env.VITE_BACKEND_PORT ?? env.VITE_BACKEND_PORT ?? '8000');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('VITE_BACKEND_PORT must be an integer from 1024 to 65535.');
  return {
  base: './',
  define: { 'import.meta.env.VITE_BACKEND_URL': JSON.stringify(`http://127.0.0.1:${port}`) },
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    target: 'chrome116',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      input: {
        dashboard: entry('./index.html'),
        webcam: entry('./webcam.html'),
        offscreen: entry('./src/offscreen/offscreen.html'),
        'service-worker': entry('./src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  };
});
