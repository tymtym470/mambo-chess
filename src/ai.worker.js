import { analyze } from './ai.js';
import { Match } from './game.js';
import { bestMoveUci } from './stockfish.js';

/**
 * 棋局计算 worker。
 * - 国际象棋：优先用 Stockfish（真引擎），失败或超时就回退到内置搜索。
 * - 其它棋种 / 局面分析：仍然走内置引擎。
 */
self.onmessage = async ({ data }) => {
  try {
    if (data?.game?.kind === 'chess' && !data.analysis) {
      try {
        const summary = new Match(data.game).summary();
        if (summary?.fen) {
          const level = Math.max(1, Math.min(5, data.level || 3));
          const uci = await bestMoveUci(summary.fen, [300, 500, 800, 1200, 1600][level - 1]);
          if (uci) { self.postMessage({ result: { move: uci, source: 'stockfish' } }); return; }
        }
      } catch {
        // 静默回退：引擎没加载成功也不能让对局卡住
      }
    }
    self.postMessage({ result: analyze(data.game, data.level, data.analysis) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
