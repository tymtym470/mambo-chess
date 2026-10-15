import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function reply(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const distIndex = path.join(projectRoot, 'dist', 'index.html');
const PLACEHOLDER_HTML = '<!doctype html><meta charset="utf-8"><title>mambo-chess test placeholder</title>';

/**
 * 生产模式的静态分支要读 dist/index.html（见 server.mjs）。
 * dist/ 在 .gitignore 里，干净 clone 和 CI 上并不存在，
 * 于是测试会意外依赖「本地构建过」这一前提。
 *
 * 这里在 dist/index.html 缺失时补一个占位文件，并报告是不是我们建的：
 * 是则测试结束时删掉，避免留下与真实构建混淆的产物；
 * 不是则原样保留用户的构建结果。
 */
export async function ensureDistPlaceholder() {
  try {
    await readFile(distIndex);
    return { created: false, dispose: async () => {} };
  } catch {}
  await mkdir(path.dirname(distIndex), { recursive: true });
  await writeFile(distIndex, PLACEHOLDER_HTML);
  return { created: true, dispose: async () => { await rm(distIndex, { force: true }); } };
}

export async function startHarness(handler) {
  const dist = await ensureDistPlaceholder();
  const upstream = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      await handler(req, res, body);
    } catch (error) { reply(res, 500, { error: { message: error.message } }); }
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}/v1`;
  const app = spawn(process.execPath, ['server.mjs', '--production'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: '0', AI_API_KEY: '', AI_MODEL: '', AI_BASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '', lease;
  const close = async () => {
    clearInterval(lease);
    if (app.exitCode === null && app.signalCode === null) {
      const exited = once(app, 'exit');
      app.kill();
      await exited;
    }
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    await dist.dispose();
  };
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error(`app startup timed out: ${logs}`)); }, 10000);
      app.stderr.on('data', chunk => { logs += chunk; });
      app.stdout.on('data', chunk => {
        logs += chunk;
        const match = logs.match(/Mambo Club: (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      app.once('error', error => { clearTimeout(timer); reject(error); });
      app.once('exit', code => { clearTimeout(timer); reject(new Error(`app exited ${code}: ${logs}`)); });
    });
    const ping = () => fetch(`${base}/api/lease?token=api-test`, { method: 'PUT' }).catch(() => {});
    await ping();
    lease = setInterval(ping, 2000);
    const post = async (route, body, signal) => {
      const response = await fetch(`${base}${route}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: upstreamUrl, key: '', ...body }), signal,
      });
      return { status: response.status, data: await response.json() };
    };
    return { base, upstreamUrl, post, close };
  } catch (error) { await close(); throw error; }
}
