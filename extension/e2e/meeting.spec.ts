import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';

test('Meeting Mode: Google Meet tab detection, ROI overlay, live floating captions, and cleanup', async ({}, testInfo) => {
  const profile = await mkdtemp(path.join(tmpdir(), 'signbridge-meet-e2e-'));
  const extension = path.resolve('dist');
  let context: BrowserContext | undefined;

  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      executablePath: process.env.SIGNBRIDGE_CHROMIUM_PATH,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      viewport: { width: 1280, height: 800 },
    });

    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;

    // 1. Set up synthetic Google Meet tab
    await context.route('https://meet.google.com/abc-defg-hij', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html>
          <html>
            <head><title>Google Meet · Daily Sync</title></head>
            <body style="background: #202124; color: white; margin: 0; padding: 20px;">
              <h1>Google Meet Call (Simulated)</h1>
              <div id="video-grid" style="width: 800px; height: 500px; background: #3c4043; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                <video id="mock-speaker-video" width="640" height="360" style="background: #000; border-radius: 4px;"></video>
              </div>
            </body>
          </html>`,
      })
    );

    const meetPage = await context.newPage();
    await meetPage.goto('https://meet.google.com/abc-defg-hij');

    // Find the meeting tab ID from service worker
    await expect
      .poll(async () =>
        worker.evaluate(async () => {
          const tabs = await chrome.tabs.query({ url: '*://meet.google.com/*' });
          return tabs[0]?.id;
        })
      )
      .toBeDefined();

    const tabId = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: '*://meet.google.com/*' });
      return tabs[0]?.id!;
    });

    // 2. Open extension dashboard and verify Meeting Mode panel
    const dashPage = await context.newPage();
    await dashPage.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(dashPage.getByText('Meeting Mode · Google Meet')).toBeVisible();

    // 3. Verify content script in meeting tab is inert initially
    expect(await meetPage.locator('#signbridge-caption-host').count()).toBe(0);
    expect(await meetPage.locator('#signbridge-roi-host').count()).toBe(0);

    // 4. Test ROI selector overlay injection & cancellation
    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, { target: 'content', type: 'SHOW_ROI_SELECTOR' });
    }, tabId);

    await expect(meetPage.locator('#signbridge-roi-host')).toBeAttached();
    await meetPage.screenshot({
      path: testInfo.outputPath('meeting-roi-selector.png'),
    });

    // Dismiss ROI selector via Escape key
    await meetPage.keyboard.press('Escape');
    await expect(meetPage.locator('#signbridge-roi-host')).not.toBeAttached();

    // 5. Test Live Floating Captions display
    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, { target: 'content', type: 'SHOW_CAPTIONS' });
    }, tabId);

    await expect(meetPage.locator('#signbridge-caption-host')).toBeAttached();

    // Send genuine accepted prediction: Goodafternoon (94%)
    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, {
        target: 'content',
        type: 'UPDATE_CAPTION',
        text: 'Goodafternoon',
        confidence: 0.94,
        accepted: true,
      });
    }, tabId);

    // Verify caption is rendered in Shadow DOM
    await expect
      .poll(async () =>
        meetPage.evaluate(() => {
          const host = document.getElementById('signbridge-caption-host');
          return host?.shadowRoot?.getElementById('caption-text')?.textContent;
        })
      )
      .toBe('Goodafternoon');

    const chipText = await meetPage.evaluate(() => {
      const host = document.getElementById('signbridge-caption-host');
      return host?.shadowRoot?.getElementById('confidence-chip')?.textContent;
    });
    expect(chipText).toContain('94% match');

    await meetPage.screenshot({
      path: testInfo.outputPath('meeting-live-captions.png'),
    });

    // 6. Verify unaccepted / NO_SIGN predictions do not alter text
    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, {
        target: 'content',
        type: 'UPDATE_CAPTION',
        text: 'NO_SIGN',
        confidence: 0.98,
        accepted: true,
      });
    }, tabId);

    const captionAfterNoSign = await meetPage.evaluate(() => {
      const host = document.getElementById('signbridge-caption-host');
      return host?.shadowRoot?.getElementById('caption-text')?.textContent;
    });
    expect(captionAfterNoSign).toBe('Goodafternoon');

    // 7. Test closing captions cleanly
    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, { target: 'content', type: 'CLOSE_CAPTIONS' });
    }, tabId);

    await expect(meetPage.locator('#signbridge-caption-host')).not.toBeAttached();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
