import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const explicitBackend = env.VITE_BACKEND_URL || process.env.VITE_BACKEND_URL;
  const fallbackPort = Number(process.env.VITE_BACKEND_PORT ?? env.VITE_BACKEND_PORT ?? '8000');
  if (!Number.isInteger(fallbackPort) || fallbackPort < 1024 || fallbackPort > 65535) throw new Error('VITE_BACKEND_PORT must be an integer from 1024 to 65535.');
  const backendUrl = explicitBackend || `http://127.0.0.1:${fallbackPort}`;
  const isWeb = process.env.BUILD_TARGET === 'web';
  const outDir = isWeb ? 'dist-web' : 'dist';
  const inputs: Record<string, string> = isWeb
    ? {
        dashboard: entry('./index.html'),
        webcam: entry('./webcam.html'),
      }
    : {
        dashboard: entry('./index.html'),
        webcam: entry('./webcam.html'),
        offscreen: entry('./src/offscreen/offscreen.html'),
        'service-worker': entry('./src/background/service-worker.ts'),
      };

  return {
    base: isWeb ? '/' : './',
    define: { 'import.meta.env.VITE_BACKEND_URL': JSON.stringify(backendUrl) },
    plugins: [react(), tailwindcss()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '0.0.0.0', port: 4173, allowedHosts: ['signbridge-2mpr.onrender.com'] },
    build: {
      target: 'chrome116',
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: inputs,
        output: {
          entryFileNames: (chunk) => chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
