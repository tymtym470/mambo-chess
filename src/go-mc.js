/**
 * 极简快速围棋盘 + 随机对局（蒙特卡洛）。
 *
 * 为什么单独写一套：@sabaki/go-board 每次落子都克隆整盘，一秒钟只能走几千步，
 * 不够跑随机对局。这里用 Int8Array + 原地提子，一次随机对局几百手也很快。
 * 只用于"评估候选点"，最终落子仍然回到 Match 的规则实现上。
 */
export class FastBoard {
  constructor(n) {
    this.n = n;
    this.b = new Int8Array(n * n);
    this.ko = -1;
  }

  static fromSignMap(signMap) {
    const n = signMap.length;
    const f = new FastBoard(n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) f.b[y * n + x] = signMap[y][x];
    return f;
  }

  clone() {
    const f = new FastBoard(this.n);
    f.b.set(this.b);
    f.ko = this.ko;
    return f;
  }

  /** 同色棋块与气。返回棋块点列表，气数写进 out.libs。 */
  chain(i, out = { stones: [], libs: 0 }) {
    const n = this.n, color = this.b[i];
    out.stones.length = 0;
    out.libs = 0;
    const seen = this._seen || (this._seen = new Uint8Array(n * n));
    seen.fill(0);
    const stack = [i];
    seen[i] = 1;
    const libSeen = this._libSeen || (this._libSeen = new Uint8Array(n * n));
    libSeen.fill(0);
    while (stack.length) {
      const cur = stack.pop();
      out.stones.push(cur);
      const x = cur % n, y = (cur / n) | 0;
      const nb = [x > 0 ? cur - 1 : -1, x < n - 1 ? cur + 1 : -1, y > 0 ? cur - n : -1, y < n - 1 ? cur + n : -1];
      for (const p of nb) {
        if (p < 0) continue;
        const v = this.b[p];
        if (v === 0) { if (!libSeen[p]) { libSeen[p] = 1; out.libs++; } }
        else if (v === color && !seen[p]) { seen[p] = 1; stack.push(p); }
      }
    }
    return out;
  }

  isEye(i, color) {
    const n = this.n, x = i % n, y = (i / n) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, y > 0 ? i - n : -1, y < n - 1 ? i + n : -1];
    let all = true;
    for (const p of nb) { if (p < 0) continue; if (this.b[p] !== color) { all = false; break; } }
    return all;
  }

  /** 落子（含提子/自杀/打劫判断）。非法返回 false。eyeCheck=false 时允许填自己的眼。 */
  play(i, color, eyeCheck = true) {
    if (this.b[i] !== 0) return false;
    if (i === this.ko) return false;
    if (eyeCheck && this.isEye(i, color)) return false;
    this.b[i] = color;
    let captured = 0, koPoint = -1;
    const n = this.n, x = i % n, y = (i / n) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, y > 0 ? i - n : -1, y < n - 1 ? i + n : -1];
    for (const p of nb) {
      if (p < 0 || this.b[p] !== -color) continue;
      const c = this.chain(p);
      if (c.libs === 0) {
        for (const s of c.stones) this.b[s] = 0;
        captured += c.stones.length;
        if (captured === 1 && c.stones.length === 1) koPoint = c.stones[0];
      }
    }
    const own = this.chain(i);
    if (own.libs === 0) {          // 自杀：撤销
      this.b[i] = 0;
      if (captured) return false;  // 有提子的情况理论上不会自杀，保守处理
      return false;
    }
    this.ko = captured === 1 ? koPoint : -1;
    return true;
  }

  /** 面积计分（子 + 单色包围的空点），返回黑减白。 */
  score() {
    const n = this.n, b = this.b;
    let black = 0, white = 0;
    const seen = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (b[i] === 1) { black++; continue; }
      if (b[i] === -1) { white++; continue; }
      if (seen[i]) continue;
      const stack = [i], region = [];
      const colors = new Set();
      seen[i] = 1;
      while (stack.length) {
        const cur = stack.pop();
        region.push(cur);
        const cx = cur % n, cy = (cur / n) | 0;
        const nb = [cx > 0 ? cur - 1 : -1, cx < n - 1 ? cur + 1 : -1, cy > 0 ? cur - n : -1, cy < n - 1 ? cur + n : -1];
        for (const p of nb) {
          if (p < 0) continue;
          const v = b[p];
          if (v === 0) { if (!seen[p]) { seen[p] = 1; stack.push(p); } }
          else colors.add(v);
        }
      }
      if (colors.size === 1) { if (colors.has(1)) black += region.length; else white += region.length; }
    }
    return black - white;
  }
}

const KO_OFFSET = 0.0;

/** 从当前局面随机走完一局，返回黑方视角的分差（正数=黑好）。 */
export function playout(board, toPlay, komi = 6.5, maxMoves = 600) {
  const n = board.n, total = n * n;
  let color = toPlay, passes = 0;
  for (let move = 0; move < maxMoves; move++) {
    let played = false;
    for (let tries = 0; tries < 60; tries++) {
      const i = (Math.random() * total) | 0;
      if (board.b[i] !== 0) continue;
      if (board.play(i, color)) { played = true; break; }
    }
    if (!played) {
      passes++;
      if (passes >= 2) break;
    } else passes = 0;
    color = -color;
  }
  return board.score() - komi - KO_OFFSET;
}
