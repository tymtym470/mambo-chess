/**
 * 编译 Windows 启动器 .exe（嵌入图标）。
 *
 * 用系统自带的 .NET Framework 编译器（csc.exe），无需任何第三方依赖：
 * Windows 10/11 一律自带 .NET Framework 4.x，所以直接可用。
 *
 * 产物：
 *   启动曼波棋社.exe  → 隐藏窗口启动服务并打开页面
 *   停止曼波棋社.exe  → 停止服务
 *
 * 运行：node scripts/build-launcher.mjs
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, copyFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

/** 按优先级找可用的 C# 编译器（4.0 优先，2.0 不支持某些语法）。 */
async function findCompiler() {
  const candidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework64\\v3.5\\csc.exe',
  ];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  // 最后尝试 PATH 上的 dotnet 构建（若装了 SDK）
  throw new Error('找不到 csc.exe。本项目需要 Windows 自带的 .NET Framework 4.x。');
}

const compiler = await findCompiler();
const icon = path.join(root, 'mambo.ico');
if (!existsSync(icon)) throw new Error(`缺少图标文件：${icon}`);

const targets = [
  { source: 'launcher.cs', output: '启动曼波棋社.exe' },
  { source: 'launcher-stop.cs', output: '停止曼波棋社.exe' },
];

const work = await mkdtemp(path.join(tmpdir(), 'mambo-build-'));
try {
  for (const target of targets) {
    const source = path.join(root, target.source);
    if (!existsSync(source)) throw new Error(`缺少源文件：${source}`);
    const output = path.join(root, target.output);

    // 复制到临时目录再编译，避免编译器在项目根目录留下 .pdb 等中间文件。
    const staged = path.join(work, target.source);
    await copyFile(source, staged);

    await run(compiler, [
      '/nologo',
      '/target:winexe',
      `/win32icon:${icon}`,
      `/out:${output}`,
      '/r:System.Windows.Forms.dll',
      staged,
    ], { windowsHide: true });

    console.log(`  ✓ ${target.output}`);
  }
  console.log(`\n启动器编译完成（编译器：${path.basename(compiler)}）`);
} finally {
  await rm(work, { recursive: true, force: true });
}
