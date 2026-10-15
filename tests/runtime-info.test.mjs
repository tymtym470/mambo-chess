import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, runtimeInfo } from '../scripts/runtime-info.mjs';

test('runtime fingerprint identifies both source changes and the workspace', async () => {
  const parent = path.resolve(projectRoot, 'test-results');
  await mkdir(parent, { recursive: true });
  const fixture = await mkdtemp(path.join(parent, 'runtime-info-'));
  try {
    const first = await runtimeInfo(fixture);
    assert.equal(first.appId, 'mambo-chess');
    assert.match(first.revision, /^[a-f0-9]{12}$/);
    assert.deepEqual(await runtimeInfo(fixture), first);
    assert.notEqual(first.workspaceId, (await runtimeInfo(projectRoot)).workspaceId);
    await writeFile(path.join(fixture, 'server.mjs'), '// changed runtime\n');
    const changed = await runtimeInfo(fixture);
    assert.notEqual(first.revision, changed.revision);
    assert.equal(first.workspaceId, changed.workspaceId);
    await mkdir(path.join(fixture, 'dist'));
    await writeFile(path.join(fixture, 'dist/index.html'), '<script src="/assets/new-build.js"></script>');
    assert.notEqual(changed.revision, (await runtimeInfo(fixture)).revision);
  } finally {
    assert.equal(path.dirname(fixture), parent);
    assert.ok(path.basename(fixture).startsWith('runtime-info-'));
    await rm(fixture, { recursive: true, force: true });
  }
});
