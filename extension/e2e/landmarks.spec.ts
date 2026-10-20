import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import type { VisionResponse } from '../src/vision/protocol';

test('TEST FIXTURES: genuine local detector output for two hands, pose and an empty frame', async ({}, testInfo) => {
  test.setTimeout(60_000);
  const files = [
    ['thumb_up.jpg', '5d673c081ab13b8a1812269ff57047066f9c33c07db5f4178089e8cb3fdc0291'],
    ['pose.jpg', 'c8a830ed683c0276d713dd5aeda28f415f10cd6291972084a40d0d8b934ed62b'],
  ];
  const images = await Promise.all(files.map(async ([name, hash]) => {
    const buffer = await readFile(path.resolve('e2e/fixtures', name!));
    expect(createHash('sha256').update(buffer).digest('hex')).toBe(hash);
    return buffer.toString('base64');
  }));
  const profile = await mkdtemp(path.join(tmpdir(), 'signbridge-model-test-'));
  let context: BrowserContext | undefined;
  try {
    const extension = path.resolve('dist');
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, executablePath: process.env.SIGNBRIDGE_CHROMIUM_PATH,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const service = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    await page.goto(`chrome-extension://${new URL(service.url()).host}/webcam.html`);
    const results = await page.evaluate(async (encoded) => {
      const worker = new Worker(new URL('vision-worker.js', location.href));
      const next = () => new Promise<VisionResponse>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Fixture worker timeout')), 30_000);
        worker.onerror = (event) => { clearTimeout(timeout); reject(new Error(event.message)); };
        worker.onmessage = ({ data }: MessageEvent<VisionResponse>) => {
          clearTimeout(timeout); if (data.type === 'ERROR') reject(new Error(data.message)); else resolve(data);
        };
      });
      try {
        let response = next(); worker.postMessage({ type: 'INITIALIZE' }); await response;
        const results: Extract<VisionResponse, { type: 'RESULT' }>[] = [];
        for (let i = 0; i < 3; i++) {
          const canvas = new OffscreenCanvas(764, 406); const ctx = canvas.getContext('2d')!;
          if (i < 2) {
            const bytes = Uint8Array.from(atob(encoded[i]!), (character) => character.charCodeAt(0));
            const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
            if (i === 0) {
              // TEST FIXTURE composite: original plus reflected copy. No sign meaning.
              ctx.drawImage(bitmap, 0, 0); ctx.translate(764, 0); ctx.scale(-1, 1); ctx.drawImage(bitmap, 0, 0);
            } else { canvas.width = bitmap.width; canvas.height = bitmap.height; ctx.drawImage(bitmap, 0, 0); }
            bitmap.close();
          } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          const bitmap = canvas.transferToImageBitmap(); response = next();
          worker.postMessage({ type: 'FRAME', bitmap, timestampMs: (i + 1) * 1000 }, [bitmap]);
          const result = await response;
          if (result.type !== 'RESULT') throw new Error('Unexpected worker response');
          results.push(result);
        }
        return results;
      } finally { worker.terminate(); }
    }, images);
    expect(results[0]!.frame.leftHand).toHaveLength(21);
    expect(results[0]!.frame.rightHand).toHaveLength(21);
    expect(results[1]!.frame.pose).toHaveLength(33);
    expect(results[2]!.frame.leftHand).toBeNull(); expect(results[2]!.frame.rightHand).toBeNull();
    expect(results[2]!.frame.pose).toBeNull(); expect(results[2]!.bufferSize).toBe(0);
    expect(results.every((result) => result.processingMs > 0)).toBe(true);
    const metrics = results.map((result, index) => ({ fixture: index, processingMs: result.processingMs,
      featureMs: result.featureMs, featureState: result.featureState, bufferSize: result.bufferSize,
      hands: Number(Boolean(result.frame.leftHand)) + Number(Boolean(result.frame.rightHand)), posePoints: result.frame.pose?.length ?? 0 }));
    await writeFile(testInfo.outputPath('fixture-metrics.json'), JSON.stringify(metrics, null, 2));
  } finally {
    await context?.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
