import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { reply, startHarness } from './api-test-harness.mjs';

let behavior = 'normal', pending = null, aborted = false;
const requests = [];
const harness = await startHarness((req, res, input) => {
  if (req.url.endsWith('/models')) return reply(res, 200, { data: ['V4.1', 'V4 Pro', 'paragraph'].map(id => ({ id })) });
  const task = JSON.parse(input.messages.at(-1).content);
  requests.push({ model: input.model, task });
  const move = task.legal[0]?.id;
  if (behavior === 'hold' && input.model === 'V4.1') {
    pending = { res, move };
    res.once('close', () => { aborted = true; });
    return;
  }
  const content = input.model === 'paragraph' || behavior === 'fail' || task.action === 'analyze'
    ? '当前局面需要稳健经营，优先观察对手。'
    : `推荐走法：${move}。`;
  reply(res, 200, { choices: [{ message: { content } }] });
});
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem('mambo-settings')) localStorage.setItem('mambo-settings', JSON.stringify({ enabled: false, music: false, autoAnalyze: false }));
  });
  await page.goto(harness.base);
  const runtime = await (await page.request.get(`${harness.base}/api/config`)).json();
  const wait = (predicate, message) => page.waitForFunction(predicate, null, { timeout: 10000 }).catch(() => { throw new Error(message); });
  const countMoves = () => page.evaluate(() => JSON.parse(localStorage.getItem('mambo-current')).moves.length);
  const testButton = page.getByRole('button', { name: '测试落子', exact: true });
  const saveButton = page.getByRole('button', { name: '保存并启用', exact: true });
  async function configure() {
    await page.locator('.api-status').click();
    assert.match(await page.getByTestId('server-revision').innerText(), new RegExp(runtime.revision));
    await page.locator('#api-url').fill(harness.upstreamUrl);
    await page.locator('#api-key').fill('browser-secret');
    await page.getByRole('button', { name: '拉取模型', exact: true }).click();
    await wait(() => document.querySelectorAll('#api-model option').length === 4, 'upstream models were not rendered');
    assert.equal(await page.locator('dialog select').count(), 1);
  }
  async function testMove() {
    await testButton.click();
    await wait(() => !document.querySelector('.modal-actions .primary-button').disabled, 'trial move did not enable Save');
  }

  await configure();
  await page.locator('#api-model').selectOption('paragraph');
  await testButton.click();
  await wait(() => document.querySelector('.form-status.error')?.textContent.includes('合法走法'), 'prose was not rejected by trial move');
  assert.equal(await saveButton.isDisabled(), true);
  assert.equal(await countMoves(), 0);
  await page.locator('#api-model').selectOption('V4.1');
  await testMove();
  assert.equal(await page.locator('.api-status.connected').count(), 0, 'unsaved draft marked live config as connected');
  await page.locator('dialog [aria-label="关闭"]').click();
  assert.equal(await page.locator('.api-status.connected').count(), 0);

  await configure();
  await page.locator('#api-model').selectOption('V4.1');
  await testMove();
  await page.locator('#api-key').fill('browser-secret-updated');
  assert.equal(await saveButton.isDisabled(), true, 'editing credentials retained stale verification');
  await testMove();
  await saveButton.click();
  assert.equal(await page.locator('.api-status.connected').count(), 1);
  assert.ok(!(await page.evaluate(() => localStorage.getItem('mambo-api'))).includes('secret'));
  await page.locator('[data-cell="7,7"]').click();
  await wait(() => JSON.parse(localStorage.getItem('mambo-current')).moves.length === 2, 'API did not actually place a move');

  behavior = 'fail';
  await page.locator('[data-cell="7,8"]').click();
  await page.locator('.api-error-panel').waitFor();
  assert.equal(await countMoves(), 3, 'API failure silently made a local move');
  assert.match(await page.locator('.api-error-panel').innerText(), /V4.1/);
  assert.match(await page.locator('.api-error-panel').innerText(), /chat\/completions/);
  await page.waitForTimeout(600);
  assert.equal(await countMoves(), 3);
  await page.screenshot({ path: 'test-results/api-error-desktop.png', fullPage: true });
  behavior = 'normal';
  await page.getByRole('button', { name: '重试落子', exact: true }).click();
  await wait(() => JSON.parse(localStorage.getItem('mambo-current')).moves.length === 4, 'retry did not resume the paused turn');
  assert.equal(await page.locator('.api-error-panel').count(), 0);

  behavior = 'hold';
  await page.locator('[data-cell="7,9"]').click();
  for (let i = 0; i < 40 && !pending; i++) await page.waitForTimeout(50);
  assert.ok(pending, 'old request did not start');
  await page.locator('.api-status').click();
  await page.getByRole('button', { name: '拉取模型', exact: true }).click();
  await wait(() => document.querySelectorAll('#api-model option').length === 4, 'models not refreshed');
  await page.locator('#api-model').selectOption('V4 Pro');
  await testMove();
  await saveButton.click();
  await wait(() => JSON.parse(localStorage.getItem('mambo-current')).moves.length === 6, 'new configuration did not resume pending AI turn');
  if (!pending.res.destroyed) reply(pending.res, 200, { choices: [{ message: { content: pending.move } }] });
  await page.waitForTimeout(400);
  assert.ok(aborted, 'old upstream request was not canceled');
  assert.equal(await countMoves(), 6, 'stale response placed an extra move');
  assert.equal(requests.at(-1).model, 'V4 Pro');

  behavior = 'normal';
  await page.reload();
  await page.locator('.api-analyze-button').click();
  await wait(() => document.querySelector('.analysis-note p')?.textContent.includes('稳健经营'), 'Chinese prose analysis was not displayed');
  assert.equal(await page.locator('.api-status.connected').count(), 0, 'prose-only analysis falsely verified move capability');
  await page.locator('[aria-label="专注模式"]').click();
  assert.equal(await page.locator('.right-sidebar').isVisible(), true, 'research panel disappears in focus mode');
  await page.screenshot({ path: 'test-results/api-focus-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-testid="board"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/api-focus-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile horizontal overflow');
  assert.equal(await page.locator('.taunt-panel').isVisible(), true);
  await page.locator('.api-status').click();
  await page.locator('#api-key').fill('browser-secret');
  await testMove();
  await page.screenshot({ path: 'test-results/api-modal-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => {
    const box = document.querySelector('dialog').getBoundingClientRect();
    return box.width <= innerWidth && box.height <= innerHeight;
  }), true, 'API modal does not fit mobile viewport');
  assert.equal(await page.evaluate(() => {
    const box = document.querySelector('.modal-actions .primary-button').getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight && document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === document.querySelector('.modal-actions .primary-button');
  }), true, 'mobile Save button is clipped or covered');
  assert.deepEqual(errors, []);
  console.log('API browser flow passed: discovery, trial, save, real move, failure pause, retry, stale request cancellation, analysis, focus and mobile');
} finally {
  await browser?.close();
  await harness.close();
}
