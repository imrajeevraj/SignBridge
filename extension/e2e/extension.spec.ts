import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';

test('unpacked MV3 extension, real health request, preferences and inert meeting scaffold', async ({}, testInfo) => {
  const profile = await mkdtemp(path.join(tmpdir(), 'signbridge-e2e-'));
  const extension = path.resolve('dist');
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true,
      executablePath: process.env.SIGNBRIDGE_CHROMIUM_PATH,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      viewport: { width: 1280, height: 1100 },
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`chrome-extension://${id}/index.html`);
    await expect(page.getByText('Online', { exact: true })).toBeVisible();
    await expect(page.getByText('Not Installed', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Recognition' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Stop Recognition' })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('dashboard-dark.png'), fullPage: true });
    for (const type of ['START_CAPTURE', 'STOP_CAPTURE', 'CAPTURE_STATUS', 'LANDMARK_SEQUENCE', 'INFERENCE_RESULT', 'ERROR']) {
      const response: unknown = await page.evaluate((command) => chrome.runtime.sendMessage({ target: 'background', type: command }), type);
      expect(response).toMatchObject({ ok: false, code: 'NOT_IMPLEMENTED' });
    }
    await page.getByLabel('Caption language').selectOption('hi');
    await page.getByLabel('Caption size').selectOption('large');
    await page.getByRole('checkbox').check();
    await page.getByLabel('Appearance').selectOption('light');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Caption language')).toHaveValue('hi');
    await expect(page.getByLabel('Caption size')).toHaveValue('large');
    await expect(page.getByRole('checkbox')).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: testInfo.outputPath('dashboard-light.png'), fullPage: true });
    await page.setViewportSize({ width: 420, height: 600 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('dashboard-popup-width.png'), fullPage: true });
    expect(await worker.evaluate(async () => {
      const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
      return contexts.length;
    })).toBe(0);
    expect(await page.evaluate(() => chrome.runtime.getManifest().permissions)).toEqual(['storage']);

    // A synthetic meeting page tests the real declarative content script without
    // joining a meeting or contacting a meeting provider.
    await context.route('https://meet.google.com/signbridge-test', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Meeting fixture</title><main>Native meeting controls</main>' }));
    const meeting = await context.newPage();
    await meeting.goto('https://meet.google.com/signbridge-test');
    await expect.poll(async () => worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      // No tabs permission: Chrome intentionally hides tab URLs. Probe only the
      // isolated test profile's tab IDs for our content-script response.
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        try {
          const response: unknown = await chrome.tabs.sendMessage(tab.id, { target: 'content', type: 'GET_STATUS' });
          // Chrome may resolve without a response for an unrelated extension
          // tab. Keep probing rather than returning before the meeting tab.
          if (response !== null && typeof response === 'object' && 'overlay' in response) return response;
        }
        catch { /* This test tab has no content script. */ }
      }
      return null;
    })).toMatchObject({ ok: true, phase: 1, overlay: 'not_implemented', capture: 'inactive' });
    await expect(meeting.locator('body')).toHaveText('Native meeting controls');
    expect(await meeting.locator('video, canvas, [data-signbridge]').count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    // Only remove the exact unique test profile created above.
    if (path.dirname(profile) !== path.resolve(tmpdir()) || !path.basename(profile).startsWith('signbridge-e2e-')) throw new Error('Unexpected test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
