import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 5180;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs', '--production'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  let config;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/config`);
      if (response.ok) {
        config = await response.json();
        break;
      }
    } catch {}
    await sleep(250);
  }
  if (!config?.autoShutdown) throw new Error('production server did not advertise autoShutdown');

  const token = 'lease-check-20260930';
  const lease = await fetch(`${base}/api/lease?token=${token}`, { method: 'PUT' });
  if (!lease.ok || !(await lease.json()).autoShutdown) throw new Error('lease heartbeat failed');

  await sleep(1200);
  if (child.exitCode !== null) throw new Error('server exited while the lease was active');

  const closed = await fetch(`${base}/api/lease/close?token=${token}`, { method: 'POST' });
  if (!closed.ok) throw new Error('lease close failed');

  for (let attempt = 0; attempt < 30 && child.exitCode === null; attempt += 1) await sleep(250);
  if (child.exitCode !== 0) throw new Error(`server did not exit cleanly after lease close: ${child.exitCode}`);
  console.log('production lease lifecycle passed');
} finally {
  if (child.exitCode === null) child.kill();
}
