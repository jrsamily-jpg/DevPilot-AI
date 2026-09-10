import { copyFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const result = spawnSync(process.execPath, [viteEntry, 'build'], { cwd: root, stdio: 'inherit' });

if (result.status !== 0) process.exit(result.status ?? 1);

mkdirSync(path.join(root, 'dist', 'server'), { recursive: true });
copyFileSync(path.join(root, 'worker.mjs'), path.join(root, 'dist', 'server', 'index.js'));
