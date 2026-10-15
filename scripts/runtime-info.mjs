import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const runtimeFiles = ['server.mjs', 'server/ai-api.mjs', 'src/game.js', 'scripts/runtime-info.mjs', 'package-lock.json', 'dist/index.html'];

export async function runtimeInfo(root = projectRoot) {
  const resolved = await realpath(root);
  const identity = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const hash = createHash('sha256');
  for (const file of runtimeFiles) {
    let content;
    try { content = await readFile(path.join(resolved, file)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      content = '<missing>';
    }
    hash.update(file).update('\0').update(content).update('\0');
  }
  return {
    appId: 'mambo-chess',
    workspaceId: createHash('sha256').update(identity).digest('hex').slice(0, 16),
    revision: hash.digest('hex').slice(0, 12),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await runtimeInfo()));
}
