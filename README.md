# 曼波棋社 · Mambo Chess Club

**四棋一桌的本地网页棋室** —— 五子棋、围棋、中国象棋、国际象棋，开箱即玩，不需要注册、不需要联网。

[![Deploy to GitHub Pages](https://github.com/tymtym470/mambo-chess/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/tymtym470/mambo-chess/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-brightgreen.svg)](https://nodejs.org/)

**🔗 在线试玩：<https://tymtym470.github.io/mambo-chess/>**
（在线版只有本地战术引擎；API 对弈需要后端，见下方「在线版的限制」）

**English** → [README.en.md](./README.en.md)

![曼波棋社主界面](docs/screenshots/01-gomoku.png)

---

## 这是什么

一个跑在浏览器里的棋室，四种棋共用一个界面。默认使用**内置的本地战术引擎**——
不填任何密钥、不连任何服务，双击就能下。想让它更聪明，可以接任意兼容
OpenAI Chat Completions 的模型服务：豆包、DeepSeek、通义千问、Kimi、SiliconFlow、
OpenRouter、Ollama 本地模型都行。

一只叫**曼波**的猫会陪着你：根据局势换表情、偶尔吐槽一句、赢你的时候毫不客气。

## 快速开始

### 方式一：双击启动（Windows，推荐给不想碰命令行的人）

下载仓库后，双击根目录的 **`启动曼波棋社.exe`**。它会：

- 已经在跑且版本一致 → 直接打开页面
- 没有服务 → 后台静默启动，然后打开页面
- 端口被别的程序占用 → 保留对方进程，自动换一个空闲端口
- 关掉所有页面后 → 服务自己退出，不留后台进程

停止服务用 **`停止曼波棋社.exe`**，或运行 `npm run stop`。

> 首次运行需要机器上已装 [Node.js](https://nodejs.org/)（≥ 20）。

### 方式二：命令行

```powershell
npm install
npm run dev        # 开发模式，改代码自动热更新
npm run build      # 构建静态产物到 dist/
npm start          # 生产模式运行已构建的版本
```

## 四种棋

| 棋种 | 规则 |
|---|---|
| **五子棋** | 自由五子棋，无禁手。横、竖、斜连五子或以上即胜 |
| **围棋** | 数子法，白贴 6.5 目。禁自杀与重复全盘局面（超级劫） |
| **中国象棋** | 标准规则：蹩马腿、塞象眼、炮隔子吃子、九宫、将帅不照面 |
| **国际象棋** | 标准规则：王车易位、吃过路兵、兵升变、五十回合和棋 |

规则全部交给成熟的上游库处理（`chess.js`、`elephantops`、`@sabaki/go-board`、
`gomoku-game`），本项目只做坐标归一化与结果呈现——**不自己造规则轮子**。

## 功能

### 对弈

- **双人同屏**：一台电脑两个人下，轮流落子
- **曼波 AI**：五档难度（初见 / 入门 / 进阶 / 高手 / 大师），内置本地战术引擎
- **选边**：执先手或后手都行，棋盘自动翻转
- **悔棋 / 认输 / 停一手**（围棋）、**翻转棋盘**、**专注模式**
- **落子序号**可开关，便于复盘

### 陪练

- **棋盘分析**：本地启发式评估，实时给出局势指数与候选着法
- **AI 深度解读**：让模型给出走法建议与理由（需配置 API）
- **曼波的表情**：普通、思考、吃子、嘲讽、破防、胜利、和棋，七种状态
- **音效与语音**：可分别开关，背景音乐只循环前 30 秒

### 外观

- **主题三选一**：浅色 / 深色 / 跟随系统（设置 → 外观主题）。
  深色模式正文对比度 14:1，高过 WCAG AAA 要求的 7:1
- **光感折射**：跟随鼠标的光效，可关闭
- **专注模式**：收起两侧面板，只留棋盘
- **响应式**：桌面三栏、窄屏自动堆叠，390px 宽的手机也能下

### 可靠性

这是本项目花力气最多的地方——**模型说什么不算数，规则说了才算**。

- 模型返回的着法**必须**通过本地规则引擎校验才会落盘；不合法的直接拒绝
- 越界坐标、负数、纯散文、多个候选、被截断的输出，**一律不执行**
- 首次不合法时自动纠正重试一次，仍不通过就**暂停对局并说明原因**，绝不硬塞
- 密钥只存在服务端进程或浏览器本地，**不写进浏览器存储**；错误信息会脱敏

<table>
<tr>
<td width="50%"><img src="docs/screenshots/03-xiangqi.png" alt="中国象棋"><br><sub>中国象棋 · 楚河汉界</sub></td>
<td width="50%"><img src="docs/screenshots/04-chess.png" alt="国际象棋"><br><sub>国际象棋 · 王车易位与升变</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/02-go.png" alt="围棋"><br><sub>围棋 · 数子与提子</sub></td>
<td width="50%"><img src="docs/screenshots/07-mobile.png" alt="移动端"><br><sub>移动端适配</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/08-dark.png" alt="深色模式"><br><sub>深色模式 · 五子棋</sub></td>
<td width="50%"><img src="docs/screenshots/09-dark-xiangqi.png" alt="深色模式下的中国象棋"><br><sub>深色模式 · 中国象棋</sub></td>
</tr>
</table>

## 接入模型 API（可选）

打开页面右上角的「连接 API」，选一个服务商预设，填入地址与密钥，点「拉取模型」，
从下拉栏选择上游返回的模型名，再点「测试落子」——**只有模型真的返回了合法着法，
才允许保存启用**。

内置预设：DeepSeek · OpenAI · Google Gemini · 通义千问 · Moonshot / Kimi ·
SiliconFlow · OpenRouter · Ollama 本地 · 自定义 OpenAI 兼容接口。

也可以在服务端配置：复制 `.env.example` 为 `.env` 并填入（密钥不会下发到浏览器）。

```ini
PORT=5176
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=
AI_API_KEY=
```

> 直连 `api.deepseek.com` 时，本项目会显式关闭长思考（Chat Completions 用
> `thinking.type=disabled`，Responses 用 `reasoning.effort=none`），
> 避免推理占满输出预算导致落子被截断——**不改你选的模型名**。

### 在线版的限制

GitHub Pages 是纯静态托管，**没有后端**，所以在线版：

| 功能 | 在线版 | 本地运行 |
|---|---|---|
| 四种棋对弈 | ✅ | ✅ |
| 本地战术引擎（五档 AI） | ✅ | ✅ |
| 棋盘分析 / 提示 / 悔棋 / 音效 | ✅ | ✅ |
| **模型 API 对弈 / AI 深度解读** | ❌ | ✅ |

原因：API 功能靠 `server.mjs` 代理——它负责保管密钥、做落子校验。
纯静态托管没有这层，所以这块用不了。这不是 bug，是架构取舍。

## 项目结构

```
mambo-chess/
├── 启动曼波棋社.exe      一键启动（隐藏窗口，内嵌图标）
├── 停止曼波棋社.exe      停止服务
├── server.mjs            本地服务：静态托管 + 租约 + API 代理
├── server/ai-api.mjs     模型接口：双协议、纠正重试、脱敏
├── src/
│   ├── game.js           规则适配层（四棋种统一坐标与胜负判定）
│   ├── App.jsx           主界面与状态管理
│   ├── Board.jsx         棋盘渲染
│   ├── ai.js             本地战术引擎
│   ├── ai.worker.js      引擎 Web Worker
│   ├── audio.js          音效、语音、背景音乐
│   └── storage.js        本地存档与校验
├── scripts/              启动、停止、构建启动器、截图、各类检查
├── tests/                单元测试与 API 集成测试
└── docs/screenshots/     README 用截图
```

## 开发与测试

```powershell
npm test                 # 单元测试（54 项）
npm run test:browser     # 浏览器冒烟测试：四棋种交互、AI 对弈、数子、设置
npm run test:models      # 模型接口测试
npm run test:api-browser # API 全流程：发现、试走、保存、失败暂停、重试
npm run test:lease       # 服务租约与自动退出
npm run test:launcher    # 启动器行为

npm run build:launcher   # 重新编译 启动曼波棋社.exe（需 .NET Framework）
npm run screenshots      # 重新生成 docs/screenshots/
```

推送到 `main` 会由 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
自动跑测试、构建并发布到 GitHub Pages。

## 素材授权

⚠️ **仓库内的图片与音频是从网上收集的，未取得原作者授权，不在 MIT 许可证范围内。**
个人学习、本地运行没问题；**二次分发或商用请先替换成你有权使用的素材**。
如果你是权利人并希望移除，请开 Issue，会尽快处理。详见 [ASSETS.md](./ASSETS.md)。

## 许可

源代码采用 [MIT 许可证](./LICENSE)。素材不在其覆盖范围内，见上。

## 作者

**TYM** · GitHub [@tymtym470](https://github.com/tymtym470)

四棋一桌，落子有声。
