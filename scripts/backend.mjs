import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const cwd = path.join(root, 'backend');
const python = path.join(cwd, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!existsSync(python)) { console.error('Run npm run backend:setup first.'); process.exit(1); }
const command = process.argv[2];
if (!['serve', 'test'].includes(command)) { console.error('Expected serve or test.'); process.exit(1); }
const args = command === 'serve' ? ['-m', 'app'] : ['-m', 'pytest'];
const result = spawnSync(python, args, { cwd, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
