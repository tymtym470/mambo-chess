import { Match, GAMES } from './game.js';
export function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function validateGame(input) {
  if (!input || !GAMES[input.kind] || !Array.isArray(input.moves) || input.moves.length > 2000 || input.moves.some(m => typeof m !== 'string' || m.length > 20)) throw new Error('对局数据格式无效');
  const game = {
    kind: input.kind, size: input.kind === 'go' ? input.size : GAMES[input.kind].size,
    moves: input.moves, dead: Array.isArray(input.dead) ? input.dead.filter(m => typeof m === 'string' && /^\d+,\d+$/.test(m)).slice(0, 361) : [],
    resigned: [1, -1].includes(input.resigned) ? input.resigned : null, scoreAccepted: !!input.scoreAccepted,
  };
  new Match(game);
  return game;
}
