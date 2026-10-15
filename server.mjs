import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_TIMEOUT_MS, preview, providerEndpoint, redact, requestAi, upstreamDetail, upstreamPayload } from './server/ai-api.mjs';
import { freshGame, Match } from './src/game.js';
import { runtimeInfo } from './scripts/runtime-info.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
// Snapshot once: a running process must never advertise files it has not loaded.
const runtime = { ...await runtimeInfo(root), pid: process.pid, startedAt: new Date().toISOString() };
const production = process.argv.includes('--production');
const vite = production ? null : await (await import('vite')).createServer({
  root, server: { middlewareMode: true, hmr: false }, appType: 'spa',
});
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Mambo-Revision': runtime.revision }); res.end(JSON.stringify(data)); };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.png': 'image/png', '.json': 'application/json' };
const leases = new Map();
let shutdownTimer;

function credentials(input) {
  const clientKey = typeof input.key === 'string' ? input.key.trim() : '';
  const useServer = !clientKey && !!process.env.AI_API_KEY;
  // A server secret is only ever sent to its server-configured provider.
  const base = (useServer ? process.env.AI_BASE_URL : input.baseUrl)?.trim();
  const model = (useServer ? process.env.AI_MODEL : input.model)?.trim();
  const key = clientKey || process.env.AI_API_KEY || '';
  if (!base) throw new Error('请先填写 API 地址');
  const endpoint = providerEndpoint(base);
  if (!key && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('请填写 API Key，或在服务器 .env 中配置');
  return { base, model, key };
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || '';
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return json(res, 403, { error: '仅允许本机访问' });
  if (req.url?.startsWith('/api/lease')) {
    const requestUrl = new URL(req.url, `http://${host}`);
    const token = requestUrl.searchParams.get('token') || '';
    if (!token || token.length > 120) return json(res, 400, { error: '租约令牌无效' });
    if (req.method === 'PUT') {
      leases.set(token, Date.now());
      clearTimeout(shutdownTimer);
      return json(res, 200, { ok: true, autoShutdown: production });
    }
    if (req.method === 'POST' && requestUrl.pathname === '/api/lease/close') {
      leases.delete(token);
      scheduleShutdown();
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: '租约请求方法无效' });
  }
  if (req.url === '/api/config' && req.method === 'GET') return json(res, 200, {
    ...runtime,
    configured: !!process.env.AI_API_KEY, model: process.env.AI_MODEL || '', baseUrl: process.env.AI_BASE_URL || '', autoShutdown: production,
  });
  if (req.url === '/api/models' || req.url === '/api/ai') {
    if (req.method !== 'POST') return json(res, 405, { error: '只接受 POST 请求' });
    if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(res, 403, { error: '拒绝跨站请求' });
    if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: '需要 JSON 请求' });
    let key = '', diagnostics = {}, timeout;
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 196608) return json(res, 413, { error: '请求内容过大' });
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json(res, 400, { error: '需要 JSON 对象' });
      key = typeof input.key === 'string' ? input.key.trim() : process.env.AI_API_KEY || '';
      let config;
      try { config = credentials(input); }
      catch (error) { return json(res, 400, { error: preview(error.message, key) }); }
      key = config.key;
      const modelsRequest = req.url === '/api/models';
      const route = modelsRequest ? 'models' : /\/responses\/?$/.test(new URL(config.base).pathname) ? 'responses' : 'chat/completions';
      diagnostics = { model: config.model || '', endpoint: providerEndpoint(config.base, route).href, protocol: route === 'responses' ? 'responses' : 'chat' };
      timeout = setTimeout(() => controller.abort(), modelsRequest ? 20000 : AI_TIMEOUT_MS);
      if (modelsRequest) {
        const upstream = await fetch(providerEndpoint(config.base, 'models'), {
          method: 'GET', signal: controller.signal, redirect: 'error',
          headers: { Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        });
        const payload = await upstreamPayload(upstream);
        diagnostics.upstreamStatus = upstream.status;
        if (!upstream.ok) throw new Error(`模型列表返回 HTTP ${upstream.status}：${upstreamDetail(payload) || '请检查地址、密钥或服务商权限'}`);
        const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
        const models = [...new Set(rows.map(item => typeof item === 'string' ? item : item?.id || item?.name || item?.model).filter(model => typeof model === 'string' && model.trim()).map(model => model.trim()).slice(0, 500))].sort((a, b) => a.localeCompare(b));
        return json(res, 200, { models, source: 'upstream' });
      }
      if (!config.model) return json(res, 400, { error: '请先从上游拉取并选择模型' });
      if (!['test', 'analyze', 'move'].includes(input.action)) return json(res, 400, { error: '未知请求类型' });
      let legal = Array.isArray(input.legal) ? input.legal.slice(0, 400).filter(move => move && typeof move.id === 'string' && move.id.length > 0 && move.id.length < 80).map(move => ({ id: move.id, label: typeof move.label === 'string' ? move.label : '' })) : [];
      let position = input.position;
      if (input.action === 'test' && (!legal.length || !position)) {
        const trial = new Match(freshGame());
        position = trial.summary();
        legal = trial.legalMoves().map(move => ({ id: move.id, label: move.label }));
      }
      if (input.action !== 'analyze' && !legal.length) return json(res, 400, { error: '当前棋局没有合法走法' });
      const result = await requestAi({ ...input, position, legal }, { ...config, signal: controller.signal });
      // Redact before serialization so provider-echoed credentials never reach the UI.
      return json(res, 200, sanitize({ ...result, diagnostics: { ...result.diagnostics, serverRevision: runtime.revision } }, key));
    } catch (error) {
      if (!res.headersSent && !res.destroyed) json(res, error instanceof SyntaxError ? 400 : 502, sanitize({
        error: error.name === 'AbortError'
          ? `API 请求超时（${req.url === '/api/models' ? 20 : AI_TIMEOUT_MS / 1000} 秒），请重试或选择响应更快的模型`
          : `API 请求失败：${preview(error.message, key)}`,
        diagnostics: { ...(error.diagnostics || diagnostics), serverRevision: runtime.revision },
      }, key));
    } finally { clearTimeout(timeout); }
    return;
  }
  if (req.url?.startsWith('/api/')) return json(res, 404, { error: '接口不存在' });
  if (vite) return vite.middlewares(req, res);
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const dir = path.resolve(root, 'dist');
    let file = path.resolve(dir, '.' + pathname);
    if (file !== dir && !file.startsWith(dir + path.sep)) return json(res, 403, { error: '禁止访问' });
    if (pathname === '/' || !path.extname(pathname)) file = path.join(dir, 'index.html');
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Mambo-Revision': runtime.revision });
    res.end(content);
  } catch { json(res, 404, { error: '文件不存在' }); }
});
function sanitize(value, key) {
  if (typeof value === 'string') return redact(value, key);
  if (Array.isArray(value)) return value.map(item => sanitize(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, sanitize(item, key)]));
  return value;
}
let port = process.env.PORT === '0' ? 0 : Number(process.env.PORT) || 5176;
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && process.env.MAMBO_STRICT_PORT !== '1' && port < 5200) { port++; server.listen(port, '127.0.0.1'); }
  else { console.error(error.message); process.exit(1); }
});
server.listen(port, '127.0.0.1', () => console.log(`Mambo Club: http://127.0.0.1:${server.address().port}`));
function scheduleShutdown() {
  if (!production || leases.size || !server.listening) return;
  clearTimeout(shutdownTimer);
  shutdownTimer = setTimeout(() => {
    if (leases.size || !server.listening) return;
    server.closeAllConnections?.();
    server.close(() => process.exit(0));
  }, 1800);
}
setInterval(() => {
  const cutoff = Date.now() - 6500;
  for (const [token, lastSeen] of leases) if (lastSeen < cutoff) leases.delete(token);
  scheduleShutdown();
}, 3000).unref();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await vite?.close(); server.close(() => process.exit(0)); });
