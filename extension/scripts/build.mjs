import { build, resolveConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { buildVisionWorker } from './build-worker.mjs';
import { verifyAssets } from './vision-assets.mjs';

const config = await resolveConfig({}, 'build', 'production', 'production');
const backendUrl = JSON.parse(config.define['import.meta.env.VITE_BACKEND_URL']);
await verifyAssets('public');
await build();
await buildVisionWorker();
// The compiled fetch target and packaged CSP must always select the same port.
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
manifest.content_security_policy.extension_pages = manifest.content_security_policy.extension_pages.replace('http://127.0.0.1:8000', `${backendUrl} ${backendUrl.replace('http:', 'ws:')}`);
await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
// Content scripts are classic scripts. A separate IIFE build prevents shared
// ES module imports from leaking into the manifest's content-script entry.
await build({
  configFile: false,
  publicDir: false,
  build: {
    target: 'chrome116',
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('../src/content/content.ts', import.meta.url)),
      name: 'SignBridgeContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
