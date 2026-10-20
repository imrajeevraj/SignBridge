import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Script } from 'node:vm';
import { init, parse } from 'es-module-lexer/minimal';
import { verifyAssets } from './vision-assets.mjs';

await init();

const root = path.resolve('dist');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
async function exists(relative, base = root) {
  assert(!/^(?:https?:|data:|\/\/)/i.test(relative), `Remote/data asset: ${relative}`);
  const resolved = path.resolve(base, relative.replace(/^\//, ''));
  assert(resolved.startsWith(root + path.sep), `Asset escapes dist: ${relative}`);
  assert((await stat(resolved)).isFile(), `Missing packaged file: ${relative}`);
}
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.type, 'module');
assert.deepEqual(manifest.permissions, ['storage', 'tabCapture', 'offscreen', 'activeTab', 'tabs']);
assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1/*']);
assert(!manifest.web_accessible_resources, 'Landmarks need no web-page-accessible assets');
const csp = manifest.content_security_policy.extension_pages;
assert(csp.includes("script-src 'self' 'wasm-unsafe-eval';") && csp.includes("object-src 'none'"));
assert(!/'unsafe-eval'|'unsafe-inline'|https:|\*/.test(csp), 'Unsafe CSP');
const connection = csp.match(/connect-src 'self' http:\/\/127\.0\.0\.1:(\d+) ws:\/\/127\.0\.0\.1:(\d+);/);
assert(connection && connection[1] === connection[2], 'HTTP and WebSocket must use one exact loopback port');
for (const file of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page,
  ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap((entry) => entry.js), 'src/offscreen/offscreen.html', 'webcam.html', 'vision-worker.js']) await exists(file);
await verifyAssets(root);

async function walk(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) { await walk(file); continue; }
    if (!/\.(html|js|css)$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    assert(!source.includes('@vite/client'), `Development runtime in ${file}`);
    assert(!source.includes('react-dom-client.development.js'), `React development bundle in ${file}`);
    if (file.endsWith('.html')) {
      for (const match of source.matchAll(/<(script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) await exists(match[2], path.dirname(file));
      for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        assert(/\bsrc=/.test(match[1]) && !match[2].trim(), `Inline script in ${file}`);
      }
      assert(!/\son\w+=|<style\b|\sstyle=/.test(source), `Inline executable/style content in ${file}`);
    }
    if (file.endsWith('.js')) {
      assert(!/\beval\s*\(|new Function\s*\(/.test(source), `Runtime code generation in ${file}`);
      const [imports] = parse(source);
      for (const item of imports) {
        if (item.d === -2) continue; // import.meta, not a dependency
        // MediaPipe contains an importScripts fallback with a computed import.
        // This one pinned worker uses only its hard-coded local WASM base URL;
        // WASM loaders themselves are checked against the asset SHA-256 lock.
        if (!item.n && file === path.join(root, 'vision-worker.js')) continue;
        assert(item.n, `Nonliteral dynamic import in ${file}`);
        assert(item.n.startsWith('.'), `Unbundled import ${item.n}`);
        await exists(item.n, path.dirname(file));
      }
    }
    if (file.endsWith('.css')) {
      assert(!/@import\s/.test(source), `Unbundled CSS import in ${file}`);
      for (const match of source.matchAll(/url\(["']?([^\s"')]+)["']?\)/g)) await exists(match[1], path.dirname(file));
    }
  }
}
await walk(root);
// Parsing as a classic script fails if imports/exports escaped the IIFE build.
new Script(await readFile(path.join(root, 'content.js'), 'utf8'));
new Script(await readFile(path.join(root, 'vision-worker.js'), 'utf8'));
for (const size of [16, 32, 48, 128]) {
  const png = await readFile(path.join(root, `icons/icon-${size}.png`));
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}
console.log('MV3 package validated: entries, imports, local assets, icons, CSP and classic content script.');
