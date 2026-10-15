import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, copyFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { projectRoot, runtimeInfo } from './runtime-info.mjs';

if (process.platform !== 'win32') throw new Error('The launcher check requires Windows.');
const run = promisify(execFile);
const parent = path.resolve(projectRoot, 'test-results');
await mkdir(parent, { recursive: true });
const fixture = await mkdtemp(path.join(parent, 'launcher-'));
const unrelated = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ configured: false, autoShutdown: true }));
});
await new Promise(resolve => unrelated.listen(0, '127.0.0.1', resolve));
const occupiedPort = unrelated.address().port;
let base, lease;
const pids = new Set();
async function script(name) {
  const { stdout } = await run('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(fixture, 'scripts', name),
    ...(name.startsWith('start-') ? ['-NoBrowser'] : []),
  ], {
    cwd: fixture, windowsHide: true, timeout: 30000,
    env: { ...process.env, MAMBO_PORT: String(occupiedPort), AI_API_KEY: '', AI_BASE_URL: '', AI_MODEL: '' },
  });
  return stdout;
}
try {
  for (const file of ['server.mjs', 'server/ai-api.mjs', 'src/game.js', 'package.json', 'package-lock.json',
    'dist/index.html', 'scripts/runtime-info.mjs', 'scripts/start-mambo.ps1', 'scripts/stop-mambo.ps1']) {
    await mkdir(path.dirname(path.join(fixture, file)), { recursive: true });
    await copyFile(path.join(projectRoot, file), path.join(fixture, file));
  }
  await symlink(path.join(projectRoot, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
  const opened = (await script('start-mambo.ps1')).trim();
  base = new URL(opened).origin;
  assert.notEqual(new URL(base).port, String(occupiedPort), 'unrelated server was reused');
  const ping = () => fetch(`${base}/api/lease?token=launcher-check`, { method: 'PUT' }).catch(() => {});
  await ping();
  lease = setInterval(ping, 1000);
  const first = await (await fetch(`${base}/api/config`)).json();
  pids.add(first.pid);
  assert.equal(first.revision, (await runtimeInfo(fixture)).revision);
  assert.equal(new URL(opened).searchParams.get('build'), first.revision);
  assert.equal((await script('start-mambo.ps1')).trim(), opened);
  assert.equal((await (await fetch(`${base}/api/config`)).json()).pid, first.pid, 'current service was unnecessarily restarted');

  await appendFile(path.join(fixture, 'server/ai-api.mjs'), '\n// fixture-only source update\n');
  assert.equal((await (await fetch(`${base}/api/config`)).json()).revision, first.revision, 'running process advertised unloaded source');
  const updated = (await script('start-mambo.ps1')).trim();
  assert.equal(new URL(updated).origin, base);
  const next = await (await fetch(`${base}/api/config`)).json();
  pids.add(next.pid);
  assert.notEqual(next.pid, first.pid, 'stale service was not restarted');
  assert.notEqual(next.revision, first.revision);
  assert.equal(next.revision, (await runtimeInfo(fixture)).revision);
  clearInterval(lease);
  await script('stop-mambo.ps1');
  await assert.rejects(fetch(`${base}/api/config`));
  assert.equal((await fetch(`http://127.0.0.1:${occupiedPort}/api/config`)).status, 200, 'unrelated listener was stopped');
  console.log('launcher passed: skip unrelated port, reuse exact revision, restart stale revision, scoped stop');
} finally {
  clearInterval(lease);
  for (const pid of pids) {
    try { process.kill(pid); } catch {}
  }
  unrelated.closeAllConnections();
  await new Promise(resolve => unrelated.close(resolve));
  assert.equal(path.dirname(fixture), parent);
  assert.ok(path.basename(fixture).startsWith('launcher-'));
  await rm(fixture, { recursive: true, force: true });
}
