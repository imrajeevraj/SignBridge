import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const assetManifest = JSON.parse(await readFile(new URL('../vision-assets.json', import.meta.url), 'utf8'));
export async function verifyAssets(directory) {
  for (const asset of assetManifest.assets) {
    let data;
    try { data = await readFile(path.join(directory, asset.path)); }
    catch { throw new Error(`Missing ${asset.path}. Run npm run assets:setup from the repository root.`); }
    if (createHash('sha256').update(data).digest('hex') !== asset.sha256) throw new Error(`Asset hash mismatch: ${asset.path}. Restore it with npm run assets:setup.`);
  }
}

export async function setupAssets() {
  const extension = fileURLToPath(new URL('../', import.meta.url));
  const packageDirectory = path.dirname(fileURLToPath(import.meta.resolve('@mediapipe/tasks-vision')));
  const pkg = JSON.parse(await readFile(path.join(packageDirectory, 'package.json'), 'utf8'));
  if (pkg.version !== assetManifest.version) throw new Error('MediaPipe package does not match the asset lock.');
  for (const asset of assetManifest.assets) {
    const destination = path.join(extension, 'public', asset.path);
    let data = await readFile(destination).catch(() => null);
    if (data && createHash('sha256').update(data).digest('hex') === asset.sha256) continue;
    if (asset.npmPath) data = await readFile(path.join(packageDirectory, asset.npmPath));
    else {
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(60_000), redirect: 'error' });
      if (!response.ok) throw new Error(`Asset download failed: HTTP ${response.status}`);
      data = Buffer.from(await response.arrayBuffer());
    }
    if (createHash('sha256').update(data).digest('hex') !== asset.sha256) throw new Error(`Downloaded asset hash mismatch: ${asset.path}`);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, data);
  }
  await verifyAssets(path.join(extension, 'public'));
  console.log('Local MediaPipe model/WASM assets verified against pinned SHA-256 hashes.');
}
