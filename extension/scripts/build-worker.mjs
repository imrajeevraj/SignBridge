import { build } from 'vite';
import { fileURLToPath } from 'node:url';
export function buildVisionWorker(outDir = 'dist') {
  return build({ configFile: false, publicDir: false, build: {
    target: 'chrome116', outDir, emptyOutDir: false, sourcemap: false,
    lib: { entry: fileURLToPath(new URL('../src/vision/vision-worker.ts', import.meta.url)), name: 'SignBridgeVision', formats: ['iife'], fileName: () => 'vision-worker.js' },
  } });
}
