import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';

test('SIMULATED CAMERA: local models, consent, stop/restart, hidden-tab cleanup and denial', async ({}, testInfo) => {
  test.setTimeout(120_000);
  const profile = await mkdtemp(path.join(tmpdir(), 'signbridge-camera-test-'));
  let context: BrowserContext | undefined;
  try {
    const extension = path.resolve('dist');
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, executablePath: process.env.SIGNBRIDGE_CHROMIUM_PATH,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
        '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
      viewport: { width: 1280, height: 1000 },
    });
    const service = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(service.url()).host;
    const page = await context.newPage();
    const errors: string[] = []; const external: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    context.on('request', (request) => { if (/^https?:/.test(request.url()) && !/^http:\/\/127\.0\.0\.1:\d+\/model\/info$/.test(request.url())) external.push(request.url()); });
    await page.goto(`chrome-extension://${id}/webcam.html`);
    await expect(page.getByText('Camera off', { exact: true })).toBeVisible();
    expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.srcObject)).toBeNull();
    await expect(page.getByRole('button', { name: 'Stop camera' })).toBeDisabled();
    await page.getByRole('button', { name: 'Start webcam landmarks' }).click();
    await expect(page.getByRole('status', { name: 'Camera status' })).toContainText('Local landmarks only', { timeout: 45_000 });
    await expect.poll(async () => {
      if (await page.getByRole('alert').count()) throw new Error(await page.getByRole('alert').innerText());
      return Number(await page.locator('.video-stage').getAttribute('data-processed-frames'));
    }, { timeout: 30_000 }).toBeGreaterThan(5);
    const tracks = await page.locator('video').evaluate((video: HTMLVideoElement) => {
      const stream = video.srcObject as MediaStream;
      (window as unknown as { testTracks: MediaStreamTrack[] }).testTracks = stream.getTracks();
      return stream.getTracks().map((track) => ({ kind: track.kind, state: track.readyState }));
    });
    expect(tracks).toEqual([{ kind: 'video', state: 'live' }]);
    const diagnostics = await page.locator('.studio-metrics').innerText();
    await writeFile(testInfo.outputPath('simulated-camera-metrics.txt'), diagnostics);
    await testInfo.attach('simulated-camera-diagnostics', { body: diagnostics, contentType: 'text/plain' });
    await page.getByRole('heading', { level: 1 }).evaluate((heading) => { heading.textContent = 'Webcam studio · TEST FIXTURE CAMERA'; });
    await page.screenshot({ path: testInfo.outputPath('webcam-simulated-camera.png'), fullPage: true });
    await page.getByRole('button', { name: 'Stop camera' }).click();
    expect(await page.evaluate(() => (window as unknown as { testTracks: MediaStreamTrack[] }).testTracks.every((track) => track.readyState === 'ended'))).toBe(true);
    expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.srcObject)).toBeNull();
    await expect(page.locator('.video-stage')).toHaveAttribute('data-processed-frames', '0');
    await expect(page.getByRole('heading', { name: 'Feature buffer · 0 / 32 frames' })).toBeVisible();
    await page.getByRole('button', { name: 'Start webcam landmarks' }).click();
    await expect(page.getByRole('status', { name: 'Camera status' })).toContainText('Local landmarks only', { timeout: 45_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByText('Camera off', { exact: true })).toBeVisible();
    // Dispatch the actual lifecycle event with a controlled hidden state because
    // headless Chromium does not consistently hide tabs on bringToFront().
    await page.getByRole('button', { name: 'Start webcam landmarks' }).click();
    await expect(page.getByRole('status', { name: 'Camera status' })).toContainText('Local landmarks only', { timeout: 45_000 });
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.getByRole('status', { name: 'Camera status' })).toContainText('no longer visible');
    expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.srcObject)).toBeNull();
    await page.reload();
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('TEST FIXTURE denied permission', 'NotAllowedError'); }; });
    await page.getByRole('button', { name: 'Start webcam landmarks' }).click();
    await expect(page.getByRole('alert')).toContainText('permission was denied');
    await expect(page.getByRole('button', { name: 'Start webcam landmarks' })).toBeEnabled();
    expect(errors).toEqual([]); expect(external).toEqual([]);
  } finally {
    await context?.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
