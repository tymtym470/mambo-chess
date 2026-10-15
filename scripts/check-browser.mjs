import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { reply, startHarness } from './api-test-harness.mjs';

// startHarness 会在 dist/index.html 缺失时补占位文件（并在结束时清理），
// 因此单元测试不再依赖「本地已经构建过」这一前提。
// 浏览器冒烟测试仍需要真实构建产物（要看到棋盘），CI 中先构建再跑。
const harness = process.env.BASE_URL ? null : await startHarness((req, res) => reply(res, 404, {}));
const base = process.env.BASE_URL || harness.base;

// 浏览器可执行文件：优先 Playwright 自带的 Chromium（跨平台，CI 上可用），
// 本地没装时回退到系统 Edge。Windows 上 Edge 的路径写死会在 Linux CI 上失败。
const EDGE_WINDOWS = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const launchOptions = existsSync(EDGE_WINDOWS) && !process.env.CI
  ? { executablePath: EDGE_WINDOWS }
  : {};
let browser;
try {
browser = await chromium.launch({ headless: true, ...launchOptions });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function smoke(page, label) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await assert(await page.locator('[data-testid="board"]').isVisible(), `${label}: board is not visible`);
  const box = await page.locator('body').boundingBox();
  const viewport = page.viewportSize();
  await assert(box && viewport && box.width <= viewport.width + 1, `${label}: horizontal overflow ${box?.width} > ${viewport?.width}`);
  await assert(await page.locator('.game-option').count() === 4, `${label}: game selector missing`);
  await page.screenshot({ path: `test-results/${label}-initial.png`, fullPage: true });
}

await smoke(desktop, 'desktop');
await smoke(mobile, 'mobile');
await assert(await desktop.locator('.mambo-cat').count() >= 1, 'original mascot image is not referenced');
const mascotSrc = await desktop.locator('.mambo-cat').first().getAttribute('src');
await assert(mascotSrc && !mascotSrc.includes('CYOocz'), 'stale Tenor mascot URL is still in use');
await assert(await desktop.locator('.taunt-panel').count() === 1, 'dynamic taunt panel is missing');
await assert(await desktop.locator('.cat-gallery').count() === 0, 'removed cat gallery is still mounted');
await assert((await desktop.locator('.taunt-panel-image img').getAttribute('src'))?.includes('/mambo/mambo-'), 'taunt panel is not using a local mascot asset');
// 图标地址可能是 /mambo-icon.svg（base 为 /）或 ./mambo-icon.svg（base 为相对路径，
// 用于 GitHub Pages 等子目录部署）。只校验它指向本地图标，不写死前缀。
const iconHref = await desktop.locator('link[rel="icon"]').first().getAttribute('href');
await assert(/^(?:\.\/|\/)mambo-icon\.svg$/.test(iconHref || ''), `local app icon is missing (href=${iconHref})`);
await assert((await desktop.request.get(`${base}/audio/mambo-friday.mp3`)).ok(), 'background music asset is missing');
await assert((await desktop.request.get(`${base}/audio/mambo-taunt-7-14.mp3`)).ok(), '7-14 second taunt audio asset is missing');
for (let index = 1; index <= 14; index += 1) {
  await assert((await desktop.request.get(`${base}/mambo/mambo-${String(index).padStart(2, '0')}.png`)).ok(), `mambo image ${index} is missing`);
}
await assert((await desktop.locator('body').innerText()).includes('棋盘分析'), 'analysis panel missing');
await assert(!(await desktop.locator('body').innerText()).includes('我的棋谱'), 'chess-records module still visible');

await desktop.locator('.api-status').click();
await assert(await desktop.locator('.api-preset-list button').count() >= 8, 'API provider presets are missing');
await desktop.locator('[data-api-preset="deepseek"]').click();
await assert(await desktop.locator('#api-model option').count() === 1, 'unverified model presets must not be presented as available models');
await assert(await desktop.locator('dialog select').count() === 1, 'model selection must have only one dropdown');
await assert(await desktop.locator('#api-url').inputValue() === 'https://api.deepseek.com', 'DeepSeek API base URL is incorrect');
await desktop.locator('[data-api-preset="ollama"]').click();
await assert(await desktop.locator('#api-url').inputValue() === 'http://127.0.0.1:11434/v1', 'Ollama API preset did not update the URL');
await desktop.locator('dialog [aria-label="关闭"]').click();

for (const kind of ['go', 'xiangqi', 'chess', 'gomoku']) {
  await desktop.locator(`.game-option:has-text("${kind === 'go' ? '围棋' : kind === 'xiangqi' ? '中国象棋' : kind === 'chess' ? '国际象棋' : '五子棋'}")`).click();
  await assert(await desktop.locator('.board-surface').isVisible(), `${kind}: board surface is not visible`);
}

await desktop.evaluate(() => localStorage.clear());
await desktop.reload({ waitUntil: 'domcontentloaded' });
await desktop.waitForTimeout(300);
await desktop.locator('.game-option:has-text("五子棋")').click();
await desktop.locator('.mode-switch button:has-text("双人")').click();
const cells = desktop.locator('.board-cell');
await assert(await cells.count() === 225, `gomoku: expected 225 cells, got ${await cells.count()}`);
await cells.nth(112).click();
await assert((await desktop.locator('.piece').count()) >= 1, 'gomoku: move did not place a stone');
await desktop.evaluate(() => localStorage.clear());
await desktop.reload({ waitUntil: 'domcontentloaded' });
await desktop.waitForTimeout(300);
await desktop.locator('.game-option:has-text("五子棋")').click();
await desktop.locator('.mode-switch button:has-text("曼波 AI")').click();
await desktop.locator('.board-cell').nth(112).click();
await desktop.waitForTimeout(1600);
await assert((await desktop.locator('.piece').count()) >= 2, 'gomoku: AI did not reply');

await desktop.locator('[aria-label="偏好设置"]').click();
await assert(await desktop.locator('dialog').isVisible(), 'settings dialog did not open');
const allSounds = desktop.locator('dialog [role="switch"][aria-label="所有音效"]');
await assert(await allSounds.getAttribute('aria-checked') === 'true', 'all-sounds switch should start on');
await allSounds.click();
await assert(await allSounds.getAttribute('aria-checked') === 'false', 'all-sounds switch did not turn off');
await allSounds.click();
const refraction = desktop.locator('dialog [role="switch"][aria-label="光感折射"]');
await refraction.click();
await assert(!((await desktop.locator('.app-shell').getAttribute('class')) || '').includes('refractive'), 'refraction switch did not turn off');
await refraction.click();
await assert(((await desktop.locator('.app-shell').getAttribute('class')) || '').includes('refractive'), 'refraction switch did not turn on');
await desktop.locator('dialog [aria-label="关闭"]').click();

await desktop.evaluate(() => localStorage.clear());
await desktop.reload({ waitUntil: 'domcontentloaded' });
await desktop.waitForTimeout(300);
await desktop.locator('.game-option:has-text("国际象棋")').click();
await desktop.locator('.mode-switch button:has-text("双人")').click();
await assert(await desktop.locator('.board-cell').count() === 64, 'chess: expected 64 cells');
await desktop.locator('.board-cell').nth(52).click();
await desktop.locator('.board-cell').nth(44).click();
await assert((await desktop.locator('.piece').count()) >= 32, 'chess: move interaction failed');

await desktop.evaluate(() => localStorage.clear());
await desktop.reload({ waitUntil: 'domcontentloaded' });
await desktop.waitForTimeout(300);
await desktop.locator('.game-option:has-text("围棋")').click();
await desktop.locator('.mode-switch button:has-text("双人")').click();
await desktop.locator('[data-cell="0,0"]').click();
await desktop.locator('[data-cell="1,0"]').click();
await desktop.locator('[data-cell="0,1"]').click();
await desktop.locator('[data-cell="1,1"]').click();
await desktop.locator('[data-cell="2,0"]').click();
await desktop.locator('[data-cell="2,1"]').click();
await desktop.locator('[data-cell="3,0"]').click();
await desktop.locator('[data-cell="3,1"]').click();
await desktop.locator('[data-cell="4,0"]').click();
await desktop.locator('[data-cell="4,1"]').click();
await desktop.locator('[data-cell="5,0"]').click();
await desktop.locator('[data-cell="5,1"]').click();
await desktop.locator('[aria-label="更多棋盘操作"]').click();
await desktop.locator('dialog button:has-text("停一手")').click();
await desktop.locator('[aria-label="更多棋盘操作"]').click();
await desktop.locator('dialog button:has-text("停一手")').click();
await assert(await desktop.locator('.scoring-bar').isVisible(), 'go: two passes did not enter scoring');
await desktop.locator('.scoring-bar .primary-button').click();
await desktop.locator('dialog button:has-text("确认")').click();
await assert(await desktop.locator('.result-banner').isVisible(), 'go: score result banner did not appear');
await assert((await desktop.locator('.result-banner').innerText()).includes('胜') || (await desktop.locator('.result-banner').innerText()).includes('和'), 'go: score result is not explicit');

await desktop.evaluate(() => localStorage.clear());
await desktop.reload({ waitUntil: 'domcontentloaded' });
await desktop.locator('.game-option:has-text("五子棋")').click();
await desktop.locator('.mode-switch button:has-text("双人")').click();
for (const [x, y] of [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0]]) {
  await desktop.locator(`[data-cell="${x},${y}"]`).click();
}
await assert(await desktop.locator('.result-banner').isVisible(), 'gomoku: result banner did not appear');
await assert((await desktop.locator('.result-banner').innerText()).includes('黑棋获胜'), 'gomoku: result banner has wrong winner');

await desktop.screenshot({ path: 'test-results/desktop-final.png', fullPage: true });
await mobile.screenshot({ path: 'test-results/mobile-final.png', fullPage: true });
console.log('browser smoke passed');
} finally {
  await browser?.close();
  await harness?.close();
}
