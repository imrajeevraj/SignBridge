import { createServer } from 'vite';
import { buildVisionWorker } from './build-worker.mjs';
import { verifyAssets } from './vision-assets.mjs';
await verifyAssets('public');
await buildVisionWorker('public');
const server = await createServer();
await server.listen();
server.printUrls();
console.log('Restart npm run dev after editing vision worker modules. React UI has normal Vite hot reload.');
