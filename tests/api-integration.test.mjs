import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, reply } from '../scripts/api-test-harness.mjs';
import { advance, freshGame, Match } from '../src/game.js';

test('API transport and move validation', { timeout: 30000 }, async t => {
  const calls = [];
  const harness = await startHarness((req, res, input) => {
    if (req.url === '/v1/models') return reply(res, 200, { data: [{ id: 'V4 Pro' }, { id: 'V4.1' }, { id: 'plain' }] });
    calls.push({ url: req.url, input });
    if (input.model === 'broken') return reply(res, 401, { error: { message: `Invalid API key: ${req.headers.authorization}` } });
    if (input.model === 'rate-limit') return reply(res, 429, { error: { message: 'Rate limit exceeded' } });
    if (input.model === 'responses-only' && req.url.endsWith('/chat/completions')) return reply(res, 404, { error: { message: 'Endpoint not found' } });
    if (input.model === 'tokens' && input.max_tokens) return reply(res, 400, { error: { message: 'max_tokens unsupported; use max_completion_tokens' } });
    if (input.model === 'no-format' && input.response_format) return reply(res, 400, { error: { message: 'response_format unsupported' } });
    const prompt = input.messages?.at(-1)?.content || input.input?.at(-1)?.content;
    const task = JSON.parse(prompt);
    const move = task.legal[0]?.id ?? null;
    let content = JSON.stringify({ move, title: '测试', summary: '当前棋局分析', reason: '合法候选' });
    let reasoning;
    if (input.model === 'plain' || input.model === 'V4.1') content = move;
    if (input.model === 'chinese') content = `推荐走法：${move}，优先控制中心。`;
    if (input.model === 'prose') content = '当前需要稳健经营，请观察对手的后续变化。';
    if (input.model === 'ok-only') content = 'OK';
    if (input.model === 'conflicting') { content = move; reasoning = JSON.stringify({ move: task.legal[1]?.id }); }
    if (input.model === 'ambiguous') content = `可以走 ${move}，也可以走 ${task.legal[1]?.id}。`;
    if (input.model === 'repair-prose' && !task.correction) content = '先占据中心。';
    if (input.model === 'repair-invalid' && !task.correction) content = '{"move":"999,999","summary":"可以走7,7"}';
    if (input.model === 'repair-null' && !task.correction) content = '{"move":null}';
    if (input.model === 'array') content = '{"move":[7,7]}';
    if (input.model === 'nested') content = '答案：\n```json\n{"move":{"x":7,"y":7},"summary":"比较17,7"}\n```';
    if (input.model === 'length') return reply(res, 200, { choices: [{ finish_reason: 'length', message: { content: move } }] });
    if (input.model === 'thinking-only') return reply(res, 200, { choices: [{ message: { content: '', reasoning_content: move } }] });
    if (input.model === 'leak') content = `无法完成请求 ${req.headers.authorization}。`;
    if (req.url.endsWith('/responses')) return reply(res, 200, { output: [
      { type: 'reasoning', text: task.legal[1]?.id },
      { type: 'message', content: [{ type: 'output_text', text: content }] },
    ] });
    return reply(res, 200, { choices: [{ finish_reason: 'stop', message: { content, reasoning_content: reasoning } }] });
  });
  t.after(harness.close);
  const legal = [{ id: '7,7', label: 'H8' }, { id: '17,7', label: 'R8' }, { id: '0,0', label: 'A1' }];
  const ai = (model, action = 'move', extra = {}) => harness.post('/api/ai', { model, action, legal, position: { game: 'test' }, level: 3, ...extra });

  await t.test('health, responses and errors identify the loaded server revision', async () => {
    const health = await fetch(`${harness.base}/api/config`);
    const runtime = await health.json();
    assert.equal(runtime.appId, 'mambo-chess');
    assert.match(runtime.revision, /^[a-f0-9]{12}$/);
    assert.equal(health.headers.get('x-mambo-revision'), runtime.revision);
    assert.equal((await ai('plain')).data.diagnostics.serverRevision, runtime.revision);
    assert.equal((await ai('length')).data.diagnostics.serverRevision, runtime.revision);
    const html = await fetch(`${harness.base}/?build=${runtime.revision}`);
    assert.equal(html.headers.get('cache-control'), 'no-cache');
  });
  await t.test('model names come from upstream unchanged', async () => {
    const result = await harness.post('/api/models', {});
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.models, ['plain', 'V4 Pro', 'V4.1']);
  });
  for (const model of ['plain', 'chinese', 'conflicting', 'array', 'nested', 'V4.1']) {
    await t.test(`${model}: valid first answer makes exactly one request`, async () => {
      const start = calls.length;
      const result = await ai(model);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal(result.data.move, '7,7');
      assert.equal(calls.length - start, 1);
      assert.equal(calls.at(-1).url, '/v1/chat/completions');
      assert.ok(calls.at(-1).input.max_tokens >= 4096);
    });
  }
  for (const model of ['repair-prose', 'repair-invalid', 'repair-null']) {
    await t.test(`${model}: one correction recovers a legal move`, async () => {
      const start = calls.length;
      const result = await ai(model);
      assert.equal(result.status, 200);
      assert.equal(result.data.move, '7,7');
      assert.equal(result.data.source, 'api-repaired');
      assert.equal(calls.length - start, 2);
    });
  }
  for (const model of ['prose', 'ok-only', 'ambiguous', 'thinking-only']) {
    await t.test(`${model}: connection test must fail without a final legal move`, async () => {
      const start = calls.length;
      const result = await ai(model, 'test');
      assert.equal(result.status, 502);
      assert.equal(result.data.ok, undefined);
      assert.equal(calls.length - start, 2);
      assert.equal(result.data.diagnostics.model, model);
    });
  }
  await t.test('test action uses the same move task and real board fixture', async () => {
    const result = await ai('plain', 'test', { position: null, legal: [] });
    assert.equal(result.status, 200);
    assert.equal(result.data.verified, 'legal-move');
    const task = JSON.parse(calls.at(-1).input.messages.at(-1).content);
    assert.equal(task.action, 'move');
    assert.ok(Array.isArray(task.position.board));
    assert.equal(task.legal.length, 225);
  });
  await t.test('prose analysis is useful but is not a verified move test', async () => {
    const start = calls.length;
    const result = await ai('prose', 'analyze');
    assert.equal(result.status, 200);
    assert.equal(result.data.source, 'api-text');
    assert.equal(result.data.verified, undefined);
    assert.equal(result.data.move, null);
    assert.match(result.data.summary, /稳健经营/);
    assert.equal(calls.length - start, 1);
  });
  await t.test('unsupported token and JSON parameters retry only when rejected', async () => {
    assert.equal((await ai('tokens')).status, 200);
    assert.ok(calls.at(-1).input.max_completion_tokens);
    assert.equal((await ai('no-format', 'analyze')).status, 200);
    assert.equal(calls.at(-1).input.response_format, undefined);
  });
  await t.test('explicit Responses path controls the protocol, not model names', async () => {
    const start = calls.length;
    const result = await ai('plain', 'move', { baseUrl: `${harness.upstreamUrl}/responses` });
    assert.equal(result.status, 200);
    assert.equal(result.data.diagnostics.protocol, 'responses');
    assert.equal(calls.length - start, 1);
    assert.equal(calls.at(-1).url, '/v1/responses');
  });
  await t.test('unsupported route can fall back to Responses', async () => {
    const result = await ai('responses-only');
    assert.equal(result.status, 200);
    assert.equal(result.data.diagnostics.protocol, 'responses');
  });
  for (const [model, status] of [['broken', 401], ['rate-limit', 429]]) {
    await t.test(`${status}: errors are not hidden by another endpoint retry`, async () => {
      const start = calls.length;
      const result = await ai(model, 'test', { key: 'secret-for-this-test' });
      assert.equal(result.status, 502);
      assert.equal(result.data.diagnostics.upstreamStatus, status);
      assert.equal(calls.length - start, 1);
      assert.ok(!JSON.stringify(result.data).includes('secret-for-this-test'));
    });
  }
  await t.test('reply snippets cannot expose credentials', async () => {
    const result = await ai('leak', 'test', { key: 'custom-secret-not-sk' });
    assert.equal(result.status, 502);
    assert.ok(!JSON.stringify(result.data).includes('custom-secret-not-sk'));
  });
  await t.test('truncated answer is not executed even if it contains a legal ID', async () => {
    const start = calls.length;
    const result = await ai('length');
    assert.equal(result.status, 502);
    assert.match(result.data.error, /截断/);
    assert.equal(calls.length - start, 1);
  });
  for (const kind of ['gomoku', 'go', 'xiangqi', 'chess']) {
    await t.test(`${kind}: API moves execute through the actual rules engine`, async () => {
      const game = freshGame(kind), match = new Match(game);
      const result = await ai('plain', 'move', { position: match.summary(), legal: match.legalMoves().map(({ id, label }) => ({ id, label })) });
      assert.equal(result.status, 200);
      const next = advance(game, result.data.move);
      assert.equal(next.data.moves.length, 1);
    });
  }
});
