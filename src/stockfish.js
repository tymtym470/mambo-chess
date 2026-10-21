/**
 * Stockfish（国际象棋）接入。
 *
 * 用 lichess 官方 @lichess-org/stockfish-web 的 smallnet 构建：wasm 只有 0.55MB，
 * 放在 public/stockfish 下，按 UCI 协议通信。
 *
 * 两个关键点（都踩过）：
 * 1) listen 必须在构造时就给，之后再设置收不到 stdout；
 * 2) 超时设短（2.5s），引擎没起来就立刻回退内置搜索，绝不能让对局卡住。
 */
const lines = [];
let enginePromise = null;

function assetBase() {
  const raw = import.meta.env?.BASE_URL ?? '/';
  return raw.endsWith('/') ? raw : raw + '/';
}

function loadEngine() {
  if (enginePromise) return enginePromise;
  const base = assetBase();
  enginePromise = (async () => {
    const mod = await import(/* @vite-ignore */ `${base}stockfish/sf_18_smallnet.js`);
    const factory = mod.default;
    return factory({
      locateFile: file => `${base}stockfish/${file}`,
      listen: line => lines.push(String(line).trim()),
      onError: () => {},
    });
  })();
  return enginePromise;
}

const send = (engine, command) => {
  if (typeof engine.uci === 'function') engine.uci(command);
  else if (typeof engine.postMessage === 'function') engine.postMessage(command);
  else if (typeof engine.ccall === 'function') engine.ccall('uci', null, ['string'], [command]);
};

/** 返回 UCI 着法字符串（e2e4 / e7e8q）；引擎不可用时抛错，由上层回退。 */
export async function bestMoveUci(fen, movetimeMs = 800) {
  const engine = await loadEngine();
  lines.length = 0;
  send(engine, 'position fen ' + fen);
  send(engine, 'go movetime ' + movetimeMs);
  const deadline = Date.now() + movetimeMs + 2500;
  while (Date.now() < deadline) {
    const hit = lines.find(l => l.startsWith('bestmove'));
    if (hit) {
      const move = hit.split(/\s+/)[1];
      return !move || move === '(none)' ? null : move;
    }
    await new Promise(r => setTimeout(r, 40));
  }
  throw new Error('stockfish timeout');
}
