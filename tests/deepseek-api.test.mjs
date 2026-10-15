import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAi } from '../server/ai-api.mjs';

const legal = [{ id: '7,7', label: 'H8' }, { id: '8,7', label: 'J8' }];
const task = { action: 'move', position: { game: '五子棋', turn: '黑棋' }, legal, level: 3 };
const config = { base: 'https://api.deepseek.com', model: 'deepseek-flash', key: 'test-only-secret' };
const stopped = (move = '7,7') => ({
  choices: [{ finish_reason: 'stop', message: { content: move } }],
  usage: { completion_tokens: 8, completion_tokens_details: { reasoning_tokens: 0 } },
});
const truncated = {
  choices: [{ finish_reason: 'length', message: { content: '7,7', reasoning_content: '思考尚未结束' } }],
  usage: { completion_tokens: 8192, completion_tokens_details: { reasoning_tokens: 8188 } },
};
function mockProvider(t, respond) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const request = { url: String(url), body: JSON.parse(init.body), signal: init.signal };
    calls.push(request);
    const { status = 200, payload } = respond(request, calls.length);
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  });
  return calls;
}

for (const action of ['move', 'test', 'analyze']) {
  test(`DeepSeek ${action} explicitly disables thinking without renaming the model`, async t => {
    const calls = mockProvider(t, () => ({ payload: stopped('{"move":"7,7","summary":"优先控制中心"}') }));
    const result = await requestAi({ ...task, action }, config);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
    assert.equal(calls[0].body.model, 'deepseek-flash');
    assert.deepEqual(calls[0].body.thinking, { type: 'disabled' });
    assert.equal(calls[0].body.max_tokens, 8192);
    assert.equal(result.move, '7,7');
    assert.equal(result.diagnostics.thinkingRequested, 'disabled');
    assert.equal(result.diagnostics.completionTokens, 8);
    assert.equal(result.diagnostics.reasoningTokens, 0);
    assert.equal(result.diagnostics.finishReason, 'stop');
    assert.equal(result.diagnostics.outputLimit, 8192);
  });
}

test('DeepSeek full Responses URL uses reasoning.effort none', async t => {
  const calls = mockProvider(t, () => ({ payload: {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: '7,7' }] }],
    usage: { output_tokens: 8, output_tokens_details: { reasoning_tokens: 0 } },
  } }));
  const result = await requestAi(task, { ...config, base: 'https://api.deepseek.com/v1/responses' });
  assert.deepEqual(calls[0].body.reasoning, { effort: 'none' });
  assert.equal(calls[0].body.thinking, undefined);
  assert.equal(result.diagnostics.completionTokens, 8);
  assert.equal(result.move, '7,7');
});

test('DeepSeek-specific settings are never guessed from the model name or domain suffix', async t => {
  const calls = mockProvider(t, () => ({ payload: stopped() }));
  for (const base of ['https://proxy.example/v1', 'https://api.deepseek.com.example/v1']) {
    const result = await requestAi(task, { ...config, base });
    assert.equal(result.diagnostics.thinkingRequested, null);
  }
  for (const { body } of calls) {
    assert.equal(body.thinking, undefined);
    assert.equal(body.reasoning, undefined);
    assert.equal(body.model, 'deepseek-flash');
  }
});

test('one truncation retries with disabled thinking and a bounded larger budget', async t => {
  const controller = new AbortController();
  const calls = mockProvider(t, (_, count) => ({ payload: count === 1 ? truncated : stopped('8,7') }));
  const result = await requestAi({ ...task, action: 'test' }, { ...config, signal: controller.signal });
  assert.equal(result.verified, 'legal-move');
  assert.equal(result.move, '8,7', 'must use the completed retry, not the truncated move');
  assert.equal(result.diagnostics.recovery, 'truncated');
  assert.equal(result.diagnostics.outputLimit, 16384);
  assert.equal(result.source, 'api-repaired');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.body.max_tokens), [8192, 16384]);
  for (const call of calls) {
    assert.deepEqual(call.body.thinking, { type: 'disabled' });
    assert.equal(call.body.model, config.model);
    assert.equal(call.signal, controller.signal);
    const sent = JSON.parse(call.body.messages.at(-1).content);
    assert.deepEqual(sent.legal, legal);
    assert.deepEqual(sent.position, task.position);
    assert.equal(sent.previous_output, undefined, 'do not feed truncated thinking into a correction');
  }
});

test('persistent truncation fails after exactly two requests with actual usage diagnostics', async t => {
  const calls = mockProvider(t, () => ({ payload: truncated }));
  await assert.rejects(requestAi(task, config), error => {
    assert.match(error.message, /截断/);
    assert.match(error.message, /已重试一次/);
    assert.equal(error.diagnostics.finishReason, 'length');
    assert.equal(error.diagnostics.completionTokens, 8192);
    assert.equal(error.diagnostics.reasoningTokens, 8188);
    assert.equal(error.diagnostics.outputLimit, 16384);
    assert.equal(error.diagnostics.thinkingRequested, 'disabled');
    return true;
  });
  assert.equal(calls.length, 2);
});

test('truncation and invalid-answer correction share a single retry', async t => {
  const calls = mockProvider(t, (_, count) => ({ payload: count === 1 ? truncated : stopped('{"move":"99,99"}') }));
  await assert.rejects(requestAi(task, config), /合法走法/);
  assert.equal(calls.length, 2);
});

test('a truncated correction is not retried a third time', async t => {
  const calls = mockProvider(t, (_, count) => ({ payload: count === 1 ? stopped('只有中文描述') : truncated }));
  await assert.rejects(requestAi(task, config), /截断/);
  assert.equal(calls.length, 2);
});

test('Responses output limit recovers but content filtering is not retried', async t => {
  const calls = mockProvider(t, (_, count) => ({ payload: count === 1
    ? { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }
    : { status: 'completed', output_text: '7,7' } }));
  assert.equal((await requestAi(task, { ...config, base: `${config.base}/responses` })).move, '7,7');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.max_output_tokens, 16384);
  assert.deepEqual(calls[1].body.reasoning, { effort: 'none' });
});

test('Responses content filtering is not mistaken for token truncation', async t => {
  const calls = mockProvider(t, () => ({ payload: { status: 'incomplete', incomplete_details: { reason: 'content_filter' } } }));
  await assert.rejects(requestAi(task, { ...config, base: `${config.base}/responses` }), /content_filter/);
  assert.equal(calls.length, 1);
});

for (const status of [401, 429]) {
  test(`DeepSeek HTTP ${status} does not trigger truncation recovery`, async t => {
    const calls = mockProvider(t, () => ({ status, payload: { error: { message: 'Upstream request rejected' } } }));
    await assert.rejects(requestAi(task, config), error => error.diagnostics.upstreamStatus === status);
    assert.equal(calls.length, 1);
  });
}
