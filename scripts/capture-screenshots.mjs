/**
 * 生成 README 用的界面截图。
 *
 * 需要先构建（npm run build），脚本会启动生产服务并逐页截图。
 * 输出到 docs/screenshots/。
 *
 * 运行：node scripts/capture-screenshots.mjs
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pillow 压缩脚本：256 色 + 抖动，浅色界面几乎无损。 */
const OPTIMIZE_SCRIPT = `
import sys, os, glob
from PIL import Image
d = sys.argv[1]
before = after = 0
for f in sorted(glob.glob(os.path.join(d, "*.png"))):
    b = os.path.getsize(f)
    im = Image.open(f).convert("RGB")
    im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG).save(f, format="PNG", optimize=True)
    a = os.path.getsize(f)
    before += b; after += a
    print("  %-26s %6.0f KB -> %6.0f KB" % (os.path.basename(f), b/1024, a/1024))
print("  合计 %.1f MB -> %.1f MB" % (before/1048576, after/1048576))
`;

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = path.join(root, 'docs', 'screenshots');
const distIndex = path.join(root, 'dist', 'index.html');

if (!existsSync(distIndex)) {
  console.error('缺少 dist/index.html，请先运行 npm run build');
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

const app = spawn(process.execPath, ['server.mjs', '--production'], {
  cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
app.stdout.on('data', c => { logs += c; });
app.stderr.on('data', c => { logs += c; });

const base = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('服务启动超时: ' + logs)), 15000);
  app.stdout.on('data', () => {
    const m = logs.match(/Mambo Club: (http:\/\/127\.0\.0\.1:\d+)/);
    if (m) { clearTimeout(timer); resolve(m[1]); }
  });
  app.once('exit', code => reject(new Error(`服务退出 ${code}: ${logs}`)));
});

// 保活租约，避免生产服务在没有页面时自动退出
const ping = () => fetch(`${base}/api/lease?token=shot`, { method: 'PUT' }).catch(() => {});
await ping();
const lease = setInterval(ping, 2000);

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const launch = existsSync(EDGE) && !process.env.CI ? { executablePath: EDGE } : {};
const browser = await chromium.launch({ headless: true, ...launch });

/** 等界面稳定：棋盘可见 + 本地分析跑完 + 动画停止 */
async function settle(page, ms = 1400) {
  await page.waitForSelector('[data-testid="board"]', { timeout: 15000 });
  await page.waitForTimeout(ms);
}

async function shoot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log('  ✓', name);
}

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: 'domcontentloaded' });

  // 固定示例对局，保证截图可复现：每种棋走几步，画面不是空盘
  const setup = async (kind, moves, mode = 'human') => {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="board"]');
    await page.locator(`.game-option:has-text("${kind}")`).click();
    if (mode === 'human') await page.locator('.mode-switch button:has-text("双人")').click();
    for (const cell of moves) {
      await page.locator(`[data-cell="${cell}"]`).click();
      await page.waitForTimeout(120);
    }
  };

  console.log('生成截图：');

  // 1. 五子棋（主界面，双人对弈中局）
  await setup('五子棋', ['7,7', '8,8', '7,8', '8,7', '7,9', '8,6', '6,7', '9,8', '7,6', '8,9']);
  await settle(page, 1800);
  await shoot(page, '01-gomoku.png');

  // 2. 围棋（中盘 + 提子）
  await setup('围棋', ['4,4', '3,3', '5,5', '3,5', '5,3', '2,4', '6,4', '4,2', '4,6']);
  await settle(page, 1800);
  await shoot(page, '02-go.png');

  // 3. 中国象棋（红方开局：炮二平五、马八进七、车九进一、兵五进一）
  //    棋盘 9 列 × 10 行，格点索引 = 行 × 9 + 列，红方在下（行 5–9）。
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="board"]');
  await page.locator('.game-option:has-text("中国象棋")').click();
  await page.locator('.mode-switch button:has-text("双人")').click();
  for (const [from, to] of [[70, 67], [19, 46], [82, 65], [1, 28], [81, 72], [3, 30], [58, 49]]) {
    await page.locator('.board-cell').nth(from).click();
    await page.locator('.board-cell').nth(to).click();
    await page.waitForTimeout(200);
  }
  await settle(page, 1200);
  await shoot(page, '03-xiangqi.png');

  // 4. 国际象棋（走成明确局面）
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="board"]');
  await page.locator('.game-option:has-text("国际象棋")').click();
  await page.locator('.mode-switch button:has-text("双人")').click();
  for (const [from, to] of [[52, 36], [12, 28], [59, 31], [11, 27], [62, 45], [3, 20]]) {
    await page.locator('.board-cell').nth(from).click();
    await page.locator('.board-cell').nth(to).click();
    await page.waitForTimeout(180);
  }
  await settle(page, 1200);
  await shoot(page, '04-chess.png');

  // 5. API 设置面板（展示服务商预设）
  await page.locator('.api-status').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, '05-api-settings.png'), fullPage: false });
  console.log('  ✓ 05-api-settings.png');
  await page.locator('dialog [aria-label="关闭"]').click();

  // 6. 偏好设置面板
  await page.locator('[aria-label="偏好设置"]').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, '06-settings.png'), fullPage: false });
  console.log('  ✓ 06-settings.png');
  await page.locator('dialog [aria-label="关闭"]').click();

  // 7. 移动端
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mobile.goto(base, { waitUntil: 'domcontentloaded' });
  await mobile.waitForSelector('[data-testid="board"]');
  await mobile.waitForTimeout(1400);
  await mobile.screenshot({ path: path.join(outDir, '07-mobile.png'), fullPage: true });
  console.log('  ✓ 07-mobile.png');

  console.log('\n截图完成，输出目录：docs/screenshots/');
} finally {
  clearInterval(lease);
  await browser.close();
  if (app.exitCode === null) { const exited = once(app, 'exit'); app.kill(); await exited; }
}

// 压缩：界面以浅色为主，256 色足够，体积约为原来的 4 成。
// 用 Python + Pillow（本机已有）；没有就跳过，不影响截图生成。
try {
  const { stdout } = await promisify(execFile)('python', ['-c', OPTIMIZE_SCRIPT, outDir], { windowsHide: true });
  console.log(stdout.trim());
} catch (error) {
  console.log('（未压缩：需要 Python + Pillow，可忽略）');
}
