import { Chess } from 'chess.js';
import { Xiangqi } from 'elephantops/xiangqi';
import { makeFen } from 'elephantops/fen';
import GoBoard from '@sabaki/go-board';
import { GomokuBoard } from 'gomoku-game';

export const GAMES = {
  gomoku: { name: '五子棋', en: 'GOMOKU', size: 15, rule: '自由五子棋 · 无禁手', first: '黑棋', second: '白棋' },
  go: { name: '围棋', en: 'GO', size: 19, rule: '数子法 · 白贴 6.5 目', first: '黑棋', second: '白棋' },
  xiangqi: { name: '中国象棋', en: 'XIANGQI', size: 9, rule: '红先黑后 · 三次重复和棋', first: '红方', second: '黑方' },
  chess: { name: '国际象棋', en: 'CHESS', size: 8, rule: '标准规则 · 支持升变与王车易位', first: '白方', second: '黑方' },
};
export const LEVELS = ['初见', '入门', '进阶', '高手', '大师'];
export const PIECE_NAMES = {
  red: { king: '帅', advisor: '仕', elephant: '相', horse: '马', chariot: '车', cannon: '炮', pawn: '兵' },
  black: { king: '将', advisor: '士', elephant: '象', horse: '马', chariot: '车', cannon: '炮', pawn: '卒' },
};
export const CHESS_NAMES = { k: '王', q: '后', r: '车', b: '象', n: '马', p: '兵' };
export const CHESS_GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
export const freshGame = (kind = 'gomoku', size) => ({ kind, size: size || GAMES[kind].size, moves: [], dead: [], resigned: null, scoreAccepted: false });
export const sideName = (kind, side) => side === 1 ? GAMES[kind].first : GAMES[kind].second;
export function goResult(score) {
  const margin = Math.abs(score.black - score.white);
  const winner = margin < 1e-9 ? 0 : score.black > score.white ? 1 : -1;
  return {
    winner,
    margin,
    reason: winner === 0 ? '数子结束 · 和棋' : `${winner === 1 ? '黑胜' : '白胜'} ${margin.toFixed(1)} 目`,
  };
}
export const coord = ([x, y], size) => `${'ABCDEFGHJKLMNOPQRST'[x]}${size - y}`;
const chessPoint = (s) => [s.charCodeAt(0) - 97, 8 - Number(s[1])];
const xqPoint = (s) => [s % 9, 9 - Math.floor(s / 9)];
const xqSquare = ([x, y]) => (9 - y) * 9 + x;
const hash = (map) => map.flat().join(',');

// Rules stay in the upstream libraries; this adapter normalizes their coordinates and outcomes.
export class Match {
  constructor(data) {
    if (!GAMES[data.kind]) throw new Error('未知棋种');
    this.data = data;
    this.kind = data.kind;
    this.size = data.kind === 'go' ? data.size : GAMES[data.kind].size;
    if (![9, 13, 19].includes(this.size) && this.kind === 'go') throw new Error('围棋棋盘尺寸无效');
    this.rows = this.kind === 'xiangqi' ? 10 : this.size;
    this.turn = 1;
    this.log = [];
    this.result = null;
    this.check = false;
    this.scoring = false;
    this.passes = 0;
    this.positions = new Map();
    this.engine = this.kind === 'chess' ? new Chess()
      : this.kind === 'xiangqi' ? Xiangqi.default()
      : this.kind === 'go' ? GoBoard.fromDimensions(this.size)
      : new GomokuBoard(this.size, this.size, 5, false);
    this.seen = new Set(this.kind === 'go' ? [hash(this.engine.signMap)] : []);
    if (this.kind === 'xiangqi') this.positions.set(this.positionKey(), 1);
    for (const id of data.moves) this.play(id);
    if (data.resigned === 1 || data.resigned === -1) {
      this.result = { winner: -data.resigned, reason: '认输' };
    }
    if (this.scoring && data.scoreAccepted) {
      const score = this.areaScore(data.dead);
      this.result = { ...goResult(score), score };
    }
  }
  positionKey() { return makeFen(this.engine.toSetup()).split(' ').slice(0, 2).join(' '); }
  get cells() {
    if (this.kind === 'gomoku') return this.engine.getBoard().map(row => row.map(v => v ? { side: v, role: 'stone' } : null));
    if (this.kind === 'go') return this.engine.signMap.map(row => row.map(v => v ? { side: v, role: 'stone' } : null));
    if (this.kind === 'chess') return this.engine.board().map(row => row.map(p => p ? { side: p.color === 'w' ? 1 : -1, role: p.type } : null));
    return Array.from({ length: 10 }, (_, y) => Array.from({ length: 9 }, (_, x) => {
      const p = this.engine.board.get(xqSquare([x, y]));
      return p ? { side: p.color === 'red' ? 1 : -1, role: p.role } : null;
    }));
  }
  legalMoves() {
    if (this.result || this.scoring) return [];
    if (this._legal) return this._legal;
    let moves;
    if (this.kind === 'chess') {
      moves = this.engine.moves({ verbose: true }).map(m => ({
        id: m.from + m.to + (m.promotion || ''), from: chessPoint(m.from), to: chessPoint(m.to),
        capture: !!m.captured, promotion: m.promotion, label: m.san, raw: { from: m.from, to: m.to, promotion: m.promotion },
      }));
    } else if (this.kind === 'xiangqi') {
      moves = [];
      for (const [from, dests] of this.engine.allDests()) for (const to of dests) {
        const piece = this.engine.board.get(from);
        const label = `${PIECE_NAMES[piece.color][piece.role]} ${coord(xqPoint(from), 10)} → ${coord(xqPoint(to), 10)}`;
        moves.push({ id: `${from}-${to}`, from: xqPoint(from), to: xqPoint(to), capture: this.engine.board.has(to), label, raw: { from, to } });
      }
    } else {
      moves = [];
      for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
        if (this.kind === 'gomoku' && this.engine.isPositionEmpty(x, y)) {
          moves.push({ id: `${x},${y}`, to: [x, y], label: coord([x, y], this.size) });
        } else if (this.kind === 'go' && this.isGoLegal([x, y])) {
          moves.push({ id: `${x},${y}`, to: [x, y], label: coord([x, y], this.size), capture: this.engine.analyzeMove(this.turn, [x, y]).capturing });
        }
      }
      if (this.kind === 'go') moves.push({ id: 'pass', label: '停一手', pass: true });
    }
    return (this._legal = moves);
  }
  isGoLegal(point) {
    const a = this.engine.analyzeMove(this.turn, point);
    if (a.overwrite || a.suicide || a.ko || a.pass) return false;
    return !this.seen.has(hash(this.engine.makeMove(this.turn, point).signMap));
  }
  play(id) {
    if (this.result || this.scoring) throw new Error('对局已经结束');
    const actor = this.turn;
    let entry;
    // Grid games validate just the chosen point during replay, avoiding a full board scan.
    if (this.kind === 'gomoku' || this.kind === 'go') {
      if (id === 'pass' && this.kind === 'go') {
        this.passes++;
        entry = { id, label: '停一手', pass: true };
        if (this.passes >= 2) this.scoring = true;
      } else {
        const point = String(id).split(',').map(Number);
        if (point.length !== 2 || point.some(n => !Number.isInteger(n) || n < 0 || n >= this.size)) throw new Error('落点无效');
        const [x, y] = point;
        entry = { id, to: point, label: coord(point, this.size) };
        if (this.kind === 'gomoku') {
          if (!this.engine.isPositionEmpty(x, y)) throw new Error('这里已经有棋子了');
          this.engine.setStone(x, y, actor);
          if (this.engine.hasWon(actor, x, y)) {
            this.result = { winner: actor, reason: '五子连珠' };
            this.winning = this.engine.getWinningCombination();
          } else if (this.engine.isTie()) this.result = { winner: 0, reason: '棋盘已满' };
        } else {
          if (!this.isGoLegal(point)) throw new Error('此处不能落子：占位、自杀或重复局面');
          const before = this.engine.getCaptures(actor);
          this.engine = this.engine.makeMove(actor, point, { preventOverwrite: true, preventSuicide: true, preventKo: true });
          entry.captured = this.engine.getCaptures(actor) - before;
          entry.capture = entry.captured > 0;
          this.seen.add(hash(this.engine.signMap));
          this.passes = 0;
        }
      }
    } else {
      const move = this.legalMoves().find(m => m.id === id);
      if (!move) throw new Error('这步棋不合法，或会让己方被将军');
      entry = { ...move };
      if (this.kind === 'chess') {
        const played = this.engine.move(move.raw);
        entry.role = played.piece;
        entry.capturedRole = played.captured;
        this.check = this.engine.isCheck();
        if (this.engine.isCheckmate()) this.result = { winner: actor, reason: '将死' };
        else if (this.engine.isStalemate()) this.result = { winner: 0, reason: '逼和' };
        else if (this.engine.isThreefoldRepetition()) this.result = { winner: 0, reason: '三次重复局面' };
        else if (this.engine.isInsufficientMaterial()) this.result = { winner: 0, reason: '子力不足' };
        else if (this.engine.isDraw()) this.result = { winner: 0, reason: '五十回合规则' };
      } else {
        entry.role = this.engine.board.get(move.raw.from).role;
        entry.capturedRole = this.engine.board.get(move.raw.to)?.role;
        this.engine.play(move.raw);
        this.check = this.engine.isCheck();
        const key = this.positionKey();
        this.positions.set(key, (this.positions.get(key) || 0) + 1);
        if (!this.engine.hasDests()) this.result = { winner: actor, reason: this.check ? '将死' : '困毙' };
        else if (this.positions.get(key) >= 3) this.result = { winner: 0, reason: '三次重复局面' };
        else if (this.engine.isInsufficientMaterial()) this.result = { winner: 0, reason: '子力不足' };
        else if (this.engine.is50Moves()) this.result = { winner: 0, reason: '五十回合未吃子' };
      }
    }
    this._legal = null;
    entry.side = actor;
    entry.check = this.check;
    entry.event = this.result ? 'win' : this.check ? 'check' : entry.capture ? 'capture' : entry.promotion ? 'promotion' : entry.pass ? 'pass' : 'move';
    this.log.push(entry);
    this.turn = -actor;
    return entry;
  }
  areaScore(dead = []) {
    const board = this.engine.signMap.map(row => [...row]);
    const removed = { black: 0, white: 0 };
    const deadSet = new Set();
    for (const id of dead) {
      const [x, y] = id.split(',').map(Number);
      const key = `${x},${y}`;
      if (deadSet.has(key) || !board[y]?.[x]) continue;
      deadSet.add(key);
      if (board[y][x] === 1) removed.black++;
      else if (board[y][x] === -1) removed.white++;
      board[y][x] = 0;
    }
    const captures = { black: this.engine.getCaptures(1), white: this.engine.getCaptures(-1) };
    let black = captures.black + removed.white;
    let white = 6.5 + captures.white + removed.black;
    let blackTerritory = 0, whiteTerritory = 0, neutral = 0;
    const visited = new Set();
    const ownership = board.map(row => row.map(() => 0));
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      if (board[y][x]) continue;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      const region = [], queue = [[x, y]], colors = new Set();
      let touchesEdge = false;
      visited.add(key);
      while (queue.length) {
        const [cx, cy] = queue.pop();
        region.push([cx, cy]);
        if (cx === 0 || cy === 0 || cx === this.size - 1 || cy === this.size - 1) touchesEdge = true;
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
          if (board[ny][nx]) colors.add(board[ny][nx]);
          else if (!visited.has(`${nx},${ny}`)) { visited.add(`${nx},${ny}`); queue.push([nx, ny]); }
        }
      }
      // The simplified scorer only counts fully enclosed single-color regions.
      // Open edge-connected space is neutral instead of awarding a lone stone
      // the entire empty board.
      const owner = colors.size === 1 && !touchesEdge ? [...colors][0] : 0;
      if (owner === 1) { black += region.length; blackTerritory += region.length; }
      else if (owner === -1) { white += region.length; whiteTerritory += region.length; }
      else neutral += region.length;
      for (const [rx, ry] of region) ownership[ry][rx] = owner;
    }
    return {
      black, white, neutral, ownership,
      territory: { black: blackTerritory, white: whiteTerritory },
      prisoners: { black: captures.black + removed.white, white: captures.white + removed.black },
      captures, dead: removed,
    };
  }
  summary() {
    return {
      game: GAMES[this.kind].name, rule: GAMES[this.kind].rule, turn: sideName(this.kind, this.turn),
      size: [this.size, this.rows], moves: this.log.slice(-40).map(m => `${sideName(this.kind, m.side)}:${m.label}`),
      board: this.cells, check: this.check, result: this.result,
      ...(this.kind === 'chess' ? { fen: this.engine.fen() } : {}),
      ...(this.kind === 'xiangqi' ? { fen: makeFen(this.engine.toSetup()) } : {}),
    };
  }
}

export function advance(data, id) {
  const match = new Match(data);
  const entry = match.play(id);
  return { data: { ...data, moves: [...data.moves, id], dead: [] }, entry };
}
export function undo(data, mode = 'human', humanSide = 1) {
  if (!data.moves.length) return data;
  let count = 1;
  if (mode === 'ai') {
    const turnAfterUndo = (data.moves.length - 1) % 2 === 0 ? 1 : -1;
    if (turnAfterUndo !== humanSide && data.moves.length >= 2) count = 2;
  }
  return { ...data, moves: data.moves.slice(0, -count), dead: [], resigned: null, scoreAccepted: false };
}
