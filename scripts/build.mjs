import { copyFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicAssets = path.join(root, 'public', 'assets');
const vinextEntry = path.join(root, 'node_modules', '.bin', 'vinext');

mkdirSync(publicAssets, { recursive: true });
copyFileSync(path.join(root, 'index.html'), path.join(root, 'public', 'devpilot.html'));
copyFileSync(path.join(root, 'assets', 'devpilot-command-center.png'), path.join(publicAssets, 'devpilot-command-center.png'));

const result = spawnSync(vinextEntry, ['build'], { cwd: root, stdio: 'inherit' });

if (result.status !== 0) process.exit(result.status ?? 1);
