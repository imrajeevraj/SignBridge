import { chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Discover this unpacked build's exact ID; authorize only that test origin.
const profile=await mkdtemp(path.join(tmpdir(),'signbridge-origin-test-'));
let context; let origin;
try {
  const extension=path.resolve('dist');
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,
    executablePath:process.env.SIGNBRIDGE_CHROMIUM_PATH,
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--use-fake-device-for-media-stream']});
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  origin=`chrome-extension://${new URL(worker.url()).host}`;
} finally {
  await context?.close();
  if(path.dirname(profile)!==path.resolve(tmpdir())||!path.basename(profile).startsWith('signbridge-origin-test-'))throw new Error('Unexpected profile path');
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
const result=spawnSync(process.execPath,[path.resolve('../node_modules/@playwright/test/cli.js'),'test',...process.argv.slice(2)],{
  stdio:'inherit',env:{...process.env,SIGNBRIDGE_EXTENSION_ORIGINS:origin,SIGNBRIDGE_TOKEN:randomBytes(32).toString('hex'),SIGNBRIDGE_MODEL_DIR:''}});
process.exit(result.status??1);
