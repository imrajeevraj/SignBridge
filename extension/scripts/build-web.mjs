import { build } from 'vite';
import { writeFile } from 'node:fs/promises';
import { buildVisionWorker } from './build-worker.mjs';
import { verifyAssets } from './vision-assets.mjs';

process.env.BUILD_TARGET = 'web';

await verifyAssets('public');
await build();
await buildVisionWorker('dist-web');

// Write Render Static Site rewrite/redirect rules
// Redirect /webcam to webcam.html and fallback everything else to index.html
await writeFile(
  'dist-web/_redirects',
  '/webcam    /webcam.html    200\n/*          /index.html     200\n',
  'utf8'
);

console.log('Standalone production web build succeeded in dist-web/');

