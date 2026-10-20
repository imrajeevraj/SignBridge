import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

test('Microsoft Edge compatibility: MV3 loading, dashboard, tab capture APIs, and Shadow DOM captions', async ({}, testInfo) => {
  const profile = await mkdtemp(path.join(tmpdir(), 'signbridge-edge-test-'));
  const extension = path.resolve('dist');
  let context: BrowserContext | undefined;

  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: EDGE_PATH,
      headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      viewport: { width: 1280, height: 800 },
    });

    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;

    // 1. Verify Edge service worker and extension APIs
    const apis = await worker.evaluate(() => ({
      hasStorage: typeof chrome.storage !== 'undefined',
      hasTabCapture: typeof chrome.tabCapture !== 'undefined',
      hasOffscreen: typeof chrome.offscreen !== 'undefined',
      hasTabs: typeof chrome.tabs !== 'undefined',
      hasRuntime: typeof chrome.runtime !== 'undefined',
    }));

    expect(apis.hasStorage).toBe(true);
    expect(apis.hasTabCapture).toBe(true);
    expect(apis.hasOffscreen).toBe(true);
    expect(apis.hasTabs).toBe(true);
    expect(apis.hasRuntime).toBe(true);

    // 2. Open dashboard in Microsoft Edge
    const dashPage = await context.newPage();
    const dashErrors: string[] = [];
    dashPage.on('pageerror', (err) => dashErrors.push(err.message));

    await dashPage.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(dashPage.getByText('Meeting Mode · Google Meet')).toBeVisible();
    await expect(dashPage.getByRole('button', { name: 'Open webcam studio' })).toBeVisible();

    await dashPage.screenshot({ path: testInfo.outputPath('edge-dashboard.png') });
    expect(dashErrors).toEqual([]);

    // 3. Set up meeting tab in Edge and verify content script Shadow DOM
    await context.route('https://meet.google.com/edge-test-call', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html>
          <html>
            <head><title>Edge Meeting Call</title></head>
            <body style="background: #202124; color: white;">
              <h1>Microsoft Edge Meeting Test</h1>
            </body>
          </html>`,
      })
    );

    const meetPage = await context.newPage();
    await meetPage.goto('https://meet.google.com/edge-test-call');

    const meetTabId = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: '*://meet.google.com/*' });
      return tabs[0]?.id!;
    });

    // Show captions overlay in Edge
    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, { target: 'content', type: 'SHOW_CAPTIONS' });
      await chrome.tabs.sendMessage(id, {
        target: 'content',
        type: 'UPDATE_CAPTION',
        text: 'Goodafternoon',
        confidence: 0.94,
        accepted: true,
      });
    }, meetTabId);

    // Verify caption renders in Edge Shadow DOM
    await expect
      .poll(async () =>
        meetPage.evaluate(() => {
          const host = document.getElementById('signbridge-caption-host');
          return host?.shadowRoot?.getElementById('caption-text')?.textContent;
        })
      )
      .toBe('Goodafternoon');

    await meetPage.screenshot({ path: testInfo.outputPath('edge-captions.png') });

    // Clean up
    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, { target: 'content', type: 'CLOSE_CAPTIONS' });
    }, meetTabId);

    await expect(meetPage.locator('#signbridge-caption-host')).not.toBeAttached();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

