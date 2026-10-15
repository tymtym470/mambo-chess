import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantText, legalMoveId, parseAnswer, preview, providerEndpoint } from '../server/ai-api.mjs';

const legal = [
  { id: '7,7', label: 'H8' }, { id: '17,7', label: 'R8' },
  { id: '0,0', label: 'A1' }, { id: '0,9', label: 'A10' },
];
test('plain legal ID and unique prose are accepted without JSON', () => {
  assert.equal(parseAnswer('7,7', legal).move, '7,7');
  assert.equal(parseAnswer('推荐走法：17,7。', legal).move, '17,7');
  assert.equal(parseAnswer('落子在 7， 7。', legal).move, '7,7');
  assert.equal(parseAnswer('A10', legal).move, '0,9');
  assert.equal(parseAnswer('推荐走法：A10。', legal).move, '0,9');
  assert.equal(parseAnswer('可以考虑 A1，也可以 A10。', legal).move, null);
  assert.equal(parseAnswer('这里是 117,7。', legal).move, null);
});
test('ambiguous alternatives and ordinary prose cannot become a move', () => {
  for (const text of ['先考虑7,7，也可以17,7。', 'move: 7,7; move: 17,7', '建议稳健经营。', 'OK']) {
    assert.equal(parseAnswer(text, legal).move, null, text);
  }
});
test('structured answers keep their outer object and invalid move is not rescued from summary', () => {
  const result = parseAnswer('说明\n```json\n{"move":[7,7],"summary":"比较17,7"}\n```', legal);
  assert.equal(result.move, '7,7');
  assert.equal(result.result.summary, '比较17,7');
  assert.equal(parseAnswer('{"move":null,"summary":"可以看看7,7"}', legal).move, null);
  assert.equal(parseAnswer('{"move":"99,99","summary":"7,7"}', legal).move, null);
  assert.equal(parseAnswer('{"move":"7,7"} {"move":"17,7"}', legal).move, null);
  assert.equal(parseAnswer('[7,7]', legal).move, '7,7');
});
test('final answer wins over reasoning, refusal and unfinished thinking never execute', () => {
  const content = assistantText({ choices: [{ message: { content: '7,7', reasoning_content: '{"move":"17,7"}' } }] });
  assert.equal(content, '7,7');
  assert.equal(assistantText({ choices: [{ message: { reasoning_content: '7,7' } }] }), '');
  assert.equal(assistantText({ choices: [{ message: { refusal: '7,7' } }] }), '');
  assert.equal(parseAnswer('<think>move: 17,7</think>\n7,7', legal).move, '7,7');
  assert.equal(parseAnswer('<think>7,7', legal).move, null);
  assert.equal(assistantText({ output: [{ type: 'reasoning', text: '17,7' }, { type: 'message', content: [{ type: 'output_text', text: '7,7' }] }] }), '7,7');
});
test('tool arguments and multiple game move shapes are normalized against legal moves', () => {
  assert.equal(assistantText({ choices: [{ message: { tool_calls: [{ function: { arguments: '{"move":"7,7"}' } }] } }] }), '{"move":"7,7"}');
  assert.equal(legalMoveId({ x: 7, y: 7 }, legal), '7,7');
  assert.equal(legalMoveId({ from: 'e2', to: 'e4' }, [{ id: 'e2e4' }]), 'e2e4');
  assert.equal(legalMoveId({ from: 'e7', to: 'e8', promotion: 'q' }, [{ id: 'e7e8q' }]), 'e7e8q');
  assert.equal(legalMoveId({ from: 12, to: 13 }, [{ id: '12-13' }]), '12-13');
  assert.equal(legalMoveId('pass', [{ id: 'pass' }]), 'pass');
});
test('endpoint paths are preserved, full endpoint URLs do not duplicate suffixes', () => {
  assert.equal(providerEndpoint('https://api.deepseek.com/v1').pathname, '/v1/chat/completions');
  assert.equal(providerEndpoint('https://example.com/prefix/v1/responses', 'models').pathname, '/prefix/v1/models');
  assert.equal(providerEndpoint('https://example.com/v1/chat/completions/').pathname, '/v1/chat/completions');
  assert.throws(() => providerEndpoint('https://user:pass@example.com'));
  assert.throws(() => providerEndpoint('http://example.com'));
});
test('diagnostic redaction happens before truncation', () => {
  const key = 'custom-secret-value';
  assert.ok(!preview(`failure ${key} Bearer abc-def sk-123456`, key).includes(key));
  assert.ok(!preview(`failure ${key} Bearer abc-def sk-123456`, key).includes('abc-def'));
});
