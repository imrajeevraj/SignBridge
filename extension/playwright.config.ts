import path from 'node:path';
import { defineConfig } from '@playwright/test';

const python = path.resolve('../backend/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const port = Number(process.env.SIGNBRIDGE_PORT ?? '8000');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid SIGNBRIDGE_PORT.');
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port ${port} --ws-max-size 262144 --ws-max-queue 1 --limit-concurrency 16`,
    cwd: '../backend',
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
