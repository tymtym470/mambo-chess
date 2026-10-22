/**
 * 中国象棋快速棋盘：90 格 Int8Array + 走法生成 + 将军判断。
 *
 * 为什么写：elephantops 每次落子都要 clone 整盘，一个节点 0.13ms，搜不深。
 * 这里用数组 + make/undo，同预算下能多搜两三成深度。
 *
 * 坐标系与 elephantops 一致：s = y*9 + x，y=0 是红方底线，y=9 是黑方底线。
 * 棋子编码：空=1? 不，空=0；正=红，负=黑；1帅 2仕 3相 4马 5车 6炮 7兵。
 */
export const KING = 1, ADVISOR = 2, ELEPHANT = 3, HORSE = 4, CHARIOT = 5, CANNON = 6, PAWN = 7;

export class FastXq {
  constructor() {
    this.b = new Int8Array(90);
    this.stack = [];
    this.side = 1;              // 1=红 0/-1? 用 1 和 -1
    this.side = 1;
  }

  static fromBoard(board, side) {
    const f = new FastXq();
    for (const [s, p] of board) f.b[s] = p.color === 'red' ? +FastXq.role(p.role) : -FastXq.role(p.role);
    f.side = side === 1 ? 1 : -1;
    return f;
  }

  static role(name) {
    return { king: KING, advisor: ADVISOR, elephant: ELEPHANT, horse: HORSE, chariot: CHARIOT, cannon: CANNON, pawn: PAWN }[name] || 0;
  }

  at(s) { return this.b[s]; }
  isRed(s) { return this.b[s] > 0; }

  make(from, to) {
    const cap = this.b[to];
    this.stack.push({ from, to, cap });
    this.b[to] = this.b[from];
    this.b[from] = 0;
    this.side = -this.side;
    return cap;
  }

  undo() {
    const m = this.stack.pop();
    if (!m) return;
    this.b[m.from] = this.b[m.to];
    this.b[m.to] = m.cap;
    this.side = -this.side;
  }

  /* ---------- 走法生成 ---------- */
  moves(out = []) {
    out.length = 0;
    const b = this.b, me = this.side;
    for (let s = 0; s < 90; s++) {
      const p = b[s];
      if (!p || Math.sign(p) !== me) continue;
      const role = Math.abs(p), x = s % 9, y = (s / 9) | 0;
      if (role === CHARIOT || role === CANNON) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let cx = x + dx, cy = y + dy, jumped = false;
          while (cx >= 0 && cx < 9 && cy >= 0 && cy < 10) {
            const t = cy * 9 + cx, v = b[t];
            if (role === CHARIOT) {
              if (!v) out.push([s, t]);
              else { if (Math.sign(v) !== me) out.push([s, t]); break; }
            } else {
              if (!jumped) { if (!v) out.push([s, t]); else jumped = true; }
              else { if (v) { if (Math.sign(v) !== me) out.push([s, t]); break; } }
            }
            cx += dx; cy += dy;
          }
        }
      } else if (role === HORSE) {
        for (const [dx, dy] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
          const lx = x + (Math.abs(dx) === 2 ? dx / 2 : 0), ly = y + (Math.abs(dy) === 2 ? dy / 2 : 0);
          if (lx < 0 || lx > 8 || ly < 0 || ly > 9) continue;
          if (b[ly * 9 + lx]) continue;                       // 蹩马腿
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx > 8 || ny < 0 || ny > 9) continue;
          const v = b[ny * 9 + nx];
          if (!v || Math.sign(v) !== me) out.push([s, ny * 9 + nx]);
        }
      } else if (role === ELEPHANT) {
        for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx > 8 || ny < 0 || ny > 9) continue;
          if (me > 0 ? ny > 4 : ny < 5) continue;             // 不过河
          if (b[(y + dy / 2) * 9 + (x + dx / 2)]) continue;   // 塞象眼
          const v = b[ny * 9 + nx];
          if (!v || Math.sign(v) !== me) out.push([s, ny * 9 + nx]);
        }
      } else if (role === ADVISOR) {
        for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 3 || nx > 5) continue;
          if (me > 0 ? ny < 0 || ny > 2 : ny < 7 || ny > 9) continue;
          const v = b[ny * 9 + nx];
          if (!v || Math.sign(v) !== me) out.push([s, ny * 9 + nx]);
        }
      } else if (role === KING) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 3 || nx > 5) continue;
          if (me > 0 ? ny < 0 || ny > 2 : ny < 7 || ny > 9) continue;
          const v = b[ny * 9 + nx];
          if (!v || Math.sign(v) !== me) out.push([s, ny * 9 + nx]);
        }
      } else if (role === PAWN) {
        const dir = me > 0 ? 1 : -1;
        const f = (y + dir) * 9 + x;
        if (y + dir >= 0 && y + dir < 10) { const v = b[f]; if (!v || Math.sign(v) !== me) out.push([s, f]); }
        const crossed = me > 0 ? y >= 5 : y <= 4;
        if (crossed) for (const dx of [-1, 1]) {
          const nx = x + dx;
          if (nx < 0 || nx > 8) continue;
          const t = y * 9 + nx, v = b[t];
          if (!v || Math.sign(v) !== me) out.push([s, t]);
        }
      }
    }
    return out;
  }

  kingSquare(color) {
    for (let s = 0; s < 90; s++) if (this.b[s] === color * KING) return s;
    return -1;
  }

  /** 某格是否被 by 方攻击 */
  attacked(sq, by) {
    const b = this.b, x = sq % 9, y = (sq / 9) | 0;
    // 车 / 炮（沿四条线）
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let cx = x + dx, cy = y + dy, blocker = 0;
      while (cx >= 0 && cx < 9 && cy >= 0 && cy < 10) {
        const v = b[cy * 9 + cx];
        if (v) {
          if (Math.sign(v) === by && (Math.abs(v) === CHARIOT || (Math.abs(v) === KING && blocker === 0 && Math.abs(dx) === 0 && Math.abs(cx - x) === 0))) return true;
          if (Math.sign(v) === by && Math.abs(v) === KING && blocker === 0) { /* 将帅照面另算 */ }
          if (blocker === 0) {
            if (Math.sign(v) === by && Math.abs(v) === CHARIOT) return true;
            blocker = 1;
          } else {
            if (Math.sign(v) === by && Math.abs(v) === CANNON) return true;
            break;
          }
        }
        cx += dx; cy += dy;
      }
    }
    // 马
    for (const [dx, dy] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx > 8 || ny < 0 || ny > 9) continue;
      const v = b[ny * 9 + nx];
      if (Math.sign(v) !== by || Math.abs(v) !== HORSE) continue;
      // 马腿在被攻击方的马那一侧
      const lx = nx - (Math.abs(dx) === 2 ? dx / 2 : 0), ly = ny - (Math.abs(dy) === 2 ? dy / 2 : 0);
      if (!b[ly * 9 + lx]) return true;
    }
    // 兵/卒
    const pawnDir = by > 0 ? 1 : -1;      // 红兵向上（y 增）吃子方向
    const back = (y - pawnDir) * 9 + x;   // 兵在攻击者的反方向一格
    if (y - pawnDir >= 0 && y - pawnDir < 10 && b[back] === by * PAWN) return true;
    for (const dx of [-1, 1]) {
      const nx = x + dx;
      if (nx < 0 || nx > 8) continue;
      if (b[y * 9 + nx] === by * PAWN) {
        const py = y;
        const crossed = by > 0 ? py >= 5 : py <= 4;
        if (crossed) return true;
      }
    }
    // 士 / 象（贴身攻击）
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx > 8 || ny < 0 || ny > 9) continue;
      const v = b[ny * 9 + nx];
      if (Math.sign(v) === by && Math.abs(v) === ADVISOR) return true;
    }
    for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx > 8 || ny < 0 || ny > 9) continue;
      const v = b[ny * 9 + nx];
      if (Math.sign(v) === by && Math.abs(v) === ELEPHANT && !b[(y + dy / 2) * 9 + (x + dx / 2)]) return true;
    }
    return false;
  }

  /** 双方将帅是否照面 */
  kingsFace() {
    const rk = this.kingSquare(1), bk = this.kingSquare(-1);
    if (rk < 0 || bk < 0) return false;
    if (rk % 9 !== bk % 9) return false;
    const x = rk % 9;
    const y1 = Math.min((rk / 9) | 0, (bk / 9) | 0), y2 = Math.max((rk / 9) | 0, (bk / 9) | 0);
    for (let y = y1 + 1; y < y2; y++) if (this.b[y * 9 + x]) return false;
    return true;
  }

  inCheck(color) {
    const k = this.kingSquare(color);
    return k >= 0 && this.attacked(k, -color);
  }

  /** 合法走法：过滤自杀与将帅照面 */
  legalMoves(out = []) {
    const all = this.moves([]);
    const res = out;
    res.length = 0;
    const me = this.side;
    for (const [from, to] of all) {
      this.make(from, to);
      const bad = this.inCheck(me) || this.kingsFace();
      this.undo();
      if (!bad) res.push([from, to]);
    }
    return res;
  }
}
