import { Match, GAMES, sideName } from './game.js';

const VALUES = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 20000, pawn: 100, horse: 430, elephant: 210, advisor: 210, chariot: 900, cannon: 460, king: 20000 };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const choice = (items) => items[Math.floor(Math.random() * items.length)];

function material(engine, kind) {
  let score = 0;
  if (kind === 'chess') {
    for (const [y, row] of engine.board().entries()) for (const [x, p] of row.entries()) {
      if (!p) continue;
      const sign = p.color === 'w' ? 1 : -1;
      const center = 7 - Math.abs(x - 3.5) - Math.abs(y - 3.5);
      const advance = sign === 1 ? 6 - y : y - 1;
      score += sign * (VALUES[p.type] + (p.type === 'p' ? advance * 9 : p.type === 'k' ? -center * 4 : center * 9));
    }
  } else {
    for (const [s, p] of engine.board) {
      const sign = p.color === 'red' ? 1 : -1;
      const x = s % 9, y = Math.floor(s / 9), advance = sign === 1 ? y : 9 - y;
      score += sign * (VALUES[p.role] + (p.role === 'pawn' ? advance * 12 + (advance >= 5 ? 70 : 0) : (4 - Math.abs(4 - x)) * 8));
    }
  }
  return score;
}

function pieceSearch(match, level, analysis) {
  const chess = match.kind === 'chess', engine = match.engine;
  const budgets = [40, 100, 260, 650, 1400];
  const deadline = performance.now() + (analysis ? 260 : budgets[level - 1]);
  const depthLimit = analysis ? 2 : [1, 1, 2, 3, 4][level - 1];
  let nodes = 0;
  const rawMoves = (pos) => chess ? pos.moves({ verbose: true }).map(m => ({
    from: m.from, to: m.to, promotion: m.promotion, captured: m.captured,
  })) : [...pos.allDests()].flatMap(([from, dests]) => [...dests].map(to => ({ from, to, captured: pos.board.get(to)?.role })));
  const moveId = (m) => chess ? m.from + m.to + (m.promotion || '') : `${m.from}-${m.to}`;
  const apply = (pos, move) => {
    if (chess) { pos.move(move); return pos; }
    const next = pos.clone(); next.play(move); return next;
  };
  const turn = (pos) => chess ? (pos.turn() === 'w' ? 1 : -1) : (pos.turn === 'red' ? 1 : -1);
  const search = (pos, depth, alpha, beta) => {
    if (++nodes % 32 === 0 && performance.now() > deadline) throw new Error('budget');
    const moves = rawMoves(pos);
    if (!moves.length) return chess && !pos.isCheck() ? 0 : -100000 - depth * 100;
    if (chess ? pos.isDraw() : pos.isInsufficientMaterial()) return 0;
    if (!depth) return material(pos, match.kind) * turn(pos);
    moves.sort((a, b) => (VALUES[b.captured] || 0) - (VALUES[a.captured] || 0));
    let best = -Infinity;
    for (const move of moves) {
      const next = apply(pos, move);
      let value;
      try { value = -search(next, depth - 1, -beta, -alpha); }
      finally { if (chess) pos.undo(); }
      best = Math.max(best, value);
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return best;
  };
  const legal = match.legalMoves();
  let ranked = legal.map(m => {
    const next = apply(engine, m.raw);
    const value = material(next, match.kind) * match.turn;
    if (chess) engine.undo();
    return { ...m, value };
  }).sort((a, b) => b.value - a.value);
  let completedDepth = 0;
  for (let depth = 1; depth <= depthLimit; depth++) {
    const results = [];
    try {
      for (const candidate of ranked) {
        if (performance.now() > deadline && results.length) throw new Error('budget');
        const next = apply(engine, candidate.raw);
        let value;
        try { value = -search(next, depth - 1, -Infinity, Infinity); }
        finally { if (chess) engine.undo(); }
        results.push({ ...candidate, value });
      }
      ranked = results.sort((a, b) => b.value - a.value);
      completedDepth = depth;
    } catch { break; }
  }
  let selected = ranked[0];
  if (!analysis && level === 1) selected = choice(ranked.slice(0, Math.min(8, ranked.length)));
  if (!analysis && level === 2) selected = choice(ranked.filter(m => m.value >= ranked[0].value - 70).slice(0, 4));
  return { ranked, selected, value: (ranked[0]?.value || 0) * match.turn, nodes, depth: completedDepth };
}

const GOMOKU_WIN = 100000000;
const GOMOKU_PATTERNS = [
  ['XXXXX', GOMOKU_WIN],
  ['-XXXX-', 10000000], ['XXXX-', 1400000], ['-XXXX', 1400000],
  ['-XXX-', 180000], ['-XX-X-', 120000], ['-X-XX-', 120000],
  ['XXX--', 22000], ['--XXX', 22000], ['XX-X-', 18000], ['-X-XX', 18000],
  ['-XX-', 2600], ['-X-X-', 1800], ['-X--', 180], ['--X-', 180],
];
const GOMOKU_SEGMENTS = {
  5: GOMOKU_WIN, 4: 1000000, 3: 18000, 2: 260, 1: 4,
};

function gomokuLine(map, x, y, side, dx, dy) {
  const n = map.length;
  const chars = [];
  for (let i = -4; i <= 4; i++) {
    const px = x + dx * i, py = y + dy * i;
    if (px < 0 || py < 0 || px >= n || py >= n) chars.push('#');
    else if (map[py][px] === side) chars.push('X');
    else if (map[py][px] === -side) chars.push('O');
    else chars.push('-');
  }
  return chars.join('');
}

export function lineValue(map, x, y, side) {
  if (!map[y]?.[x]) map[y][x] = side;
  let total = 0;
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let length = 1, openEnds = 0;
    for (const dir of [-1, 1]) {
      let i = 1;
      while (map[y + dy * i * dir]?.[x + dx * i * dir] === side) { length++; i++; }
      const ex = x + dx * i * dir, ey = y + dy * i * dir;
      if (ex >= 0 && ey >= 0 && ex < map.length && ey < map.length && !map[ey][ex]) openEnds++;
    }
    if (length >= 5) total = Math.max(total, GOMOKU_WIN);
    else total += (GOMOKU_SEGMENTS[length] || 0) * (openEnds === 2 ? 4 : openEnds === 1 ? 1 : .06);
    const line = gomokuLine(map, x, y, side, dx, dy);
    for (const [pattern, value] of GOMOKU_PATTERNS) if (line.includes(pattern)) total += value;
  }
  if (map[y][x] === side) map[y][x] = 0;
  return total;
}

function gridCandidates(map, side) {
  const n = map.length, center = (n - 1) / 2, candidates = [];
  let hasStone = false;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (map[y][x]) { hasStone = true; continue; }
    let nearby = false;
    for (let dy = -2; dy <= 2 && !nearby; dy++) for (let dx = -2; dx <= 2; dx++) if (map[y + dy]?.[x + dx]) { nearby = true; break; }
    if (hasStone && !nearby) continue;
    const attack = lineValue(map, x, y, side);
    const defend = lineValue(map, x, y, -side);
    candidates.push({
      x, y, id: `${x},${y}`, attack, defend,
      value: attack * 1.04 + defend * 1.12 + (n - Math.abs(x - center) - Math.abs(y - center)) * 1.4,
    });
  }
  if (!hasStone) candidates.push({ x: center, y: center, id: `${center},${center}`, attack: 0, defend: 0, value: 0 });
  return candidates.sort((a, b) => b.value - a.value);
}

function gomokuSearch(match, level, analysis) {
  const map = match.engine.getBoard().map(r => [...r]);
  const side = match.turn;
  const start = gridCandidates(map, side);
  const immediate = start.find(c => c.attack >= GOMOKU_WIN);
  const enemyWins = gridCandidates(map, -side).filter(c => c.attack >= GOMOKU_WIN);
  const forced = immediate || (enemyWins.length === 1 ? start.find(c => c.id === enemyWins[0].id) : null);
  let nodes = 0;
  const deadline = performance.now() + (analysis ? 180 : [25, 85, 240, 650, 1500][level - 1]);
  const width = [5, 7, 9, 11, 14][level - 1];
  const maxDepth = analysis ? 1 : [0, 1, 2, 3, 4][level - 1];
  const evaluate = currentSide => {
    const own = gridCandidates(map, currentSide).slice(0, 8);
    const opponent = gridCandidates(map, -currentSide).slice(0, 8);
    return (own[0]?.value || 0) - (opponent[0]?.value || 0) * 1.08;
  };
  const search = (currentSide, depth, alpha, beta) => {
    if (++nodes % 12 === 0 && performance.now() > deadline) throw new Error('budget');
    const own = gridCandidates(map, currentSide);
    const opponent = gridCandidates(map, -currentSide);
    if (own.some(c => c.attack >= GOMOKU_WIN)) return GOMOKU_WIN + depth * 1000;
    if (opponent.some(c => c.attack >= GOMOKU_WIN)) return -GOMOKU_WIN - depth * 1000;
    if (!depth) return evaluate(currentSide);
    const replies = own.slice(0, width);
    let best = -Infinity;
    for (const candidate of replies) {
      map[candidate.y][candidate.x] = currentSide;
      let value;
      try { value = -search(-currentSide, depth - 1, -beta, -alpha); }
      finally { map[candidate.y][candidate.x] = 0; }
      best = Math.max(best, value);
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return best;
  };
  let ranked = start.slice(0, Math.max(12, width));
  let completedDepth = 0;
  if (!forced) {
    for (let depth = 0; depth <= maxDepth; depth++) {
      try {
        const next = start.slice(0, width + 2).map(candidate => {
          map[candidate.y][candidate.x] = side;
          let value;
          try {
            value = lineValue(map, candidate.x, candidate.y, side) >= GOMOKU_WIN
              ? GOMOKU_WIN + depth * 1000
              : -search(-side, depth, -Infinity, Infinity);
          } finally { map[candidate.y][candidate.x] = 0; }
          return { ...candidate, value: value + candidate.value * .008 };
        });
        ranked = next.sort((a, b) => b.value - a.value);
        completedDepth = depth + 1;
      } catch { break; }
    }
  }
  if (forced) ranked = [forced, ...ranked.filter(c => c.id !== forced.id)];
  const legal = match.legalMoves();
  ranked = ranked.map(c => ({ ...legal.find(m => m.id === c.id), ...c })).filter(m => m.id);
  let selected = ranked[0];
  if (!analysis && !forced && level === 1) selected = choice(ranked.slice(0, 5));
  if (!analysis && !forced && level === 2) selected = choice(ranked.slice(0, 2));
  const threat = start.length ? (Math.max(...start.map(c => c.attack)) - Math.max(...start.map(c => c.defend))) : 0;
  return { ranked, selected, value: clamp(threat / 25, -1800, 1800) * side, nodes, depth: completedDepth };
}

function goSearch(match, level, analysis) {
  const board = match.engine, side = match.turn, n = match.size;
  const legal = match.legalMoves(), empty = board.signMap.flat().filter(v => v === 0).length;
  const deadline = performance.now() + (analysis ? 220 : [30, 100, 300, 750, 1500][level - 1]);
  const moves = match.log.length;
  const opening = moves < n * 2;
  const star = n >= 19 ? 3 : 2;
  const mid = (n - 1) / 2;
  // 开局点：四星 → 四边星 → 小目。按 19 路比例缩放。
  const openingPoints = [
    [star, star], [n - 1 - star, star], [star, n - 1 - star], [n - 1 - star, n - 1 - star],
    [star, mid], [n - 1 - star, mid], [mid, star], [mid, n - 1 - star],
    [star + 1, star], [star, star + 1], [n - 2 - star, star], [n - 1 - star, star + 1],
  ];
  let nodes = 0;
  const graded = [];
  for (const m of legal.filter(m => !m.pass)) {
    if (++nodes % 48 === 0 && performance.now() > deadline && graded.length > 12) break;
    const [x, y] = m.to;
    const next = board.makeMove(side, m.to);
    const taken = next.getCaptures(side) - board.getCaptures(side);
    const liberties = next.getLiberties(m.to).length;
    const neighbors = board.getNeighbors(m.to);
    const own = neighbors.filter(p => board.get(p) === side);
    const enemy = neighbors.filter(p => board.get(p) === -side);
    const eye = neighbors.length >= 2 && own.length === neighbors.length;
    const edge = Math.min(x, y, n - 1 - x, n - 1 - y);
    const thirdLine = Math.max(0, 3 - Math.abs(edge - (n >= 13 ? 3 : 2)));

    let rescue = 0;
    const seenChains = new Set();
    for (const p of own) {
      if (board.getLiberties(p).length !== 1) continue;
      const chain = board.getChain(p).map(v => v.join(',')).sort().join('|');
      if (seenChains.has(chain)) continue;
      seenChains.add(chain);
      rescue += board.getChain(p).length;
    }
    const atari = enemy.reduce((sum, p) => sum + (next.get(p) === -side && next.getLiberties(p).length === 1 ? next.getChain(p).length : 0), 0);
    const selfAtari = liberties === 1 && !rescue && !taken;

    let ownNear = 99, enemyNear = 99, anyNear = 99;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (!d || d > 4) continue;
      const px = x + dx, py = y + dy;
      if (px < 0 || py < 0 || px >= n || py >= n) continue;
      const v = board.get([px, py]);
      if (!v) continue;
      if (d < anyNear) anyNear = d;
      if (v === side) { if (d < ownNear) ownNear = d; } else if (d < enemyNear) enemyNear = d;
    }

    // 旧引擎的实地骨架：三线 + 贴子，保证它还是"会围空"的那一版
    let value = taken * 200 + (rescue ? 160 : 0) + rescue * 45 + atari * 34 + Math.min(liberties, 6) * 5
      + (own.length === 1 ? 6 : own.length === 2 ? 10 : 0)
      // 三线只在"这片区域还没有自家子"时加分：建立根基，不是沿着三线往前走
      + (opening && ownNear > 3 ? thirdLine * 9 : 0);
    if (selfAtari) value -= 240;
    if (eye && !taken) value -= 320;
    if (enemy.length) value += 12;

    if (!taken && !rescue) {
      // 一长串同向平推（老版本的毛病）：贴着自家不朝对方走的子，重罚
      if (ownNear === 1 && enemyNear > 3) value -= 210;
      // 同一条线上一格一格往前挪也是爬；斜着/跳着走不算
      if (enemyNear > 3) {
        for (let d = 1; d <= 3; d++) {
          if ((x + d < n && board.get([x + d, y]) === side) || (x - d >= 0 && board.get([x - d, y]) === side)
            || (y + d < n && board.get([x, y + d]) === side) || (y - d >= 0 && board.get([x, y - d]) === side)) { value -= 70; break; }
        }
      }
      // 挂角 / 侵消：离对方 2~3 格
      if (enemyNear === 2 || enemyNear === 3) value += 24;
      // 谁都不挨着的随手丢子
      if (anyNear > 4 && moves > 2) value -= 70;
    }
    if (edge === 0 && !taken && !rescue) value -= 340;
    if (edge === 1 && !taken && !rescue) value -= 45;

    // 开局：空的开局点 + 别把子堆在一个角
    if (opening && moves < 14) {
      for (const [px, py] of openingPoints) {
        if (Math.abs(px - x) + Math.abs(py - y) <= 1 && anyNear > 2) { value += 120 - moves * 5; break; }
      }
      if (anyNear <= 3 && enemyNear > 2 && !taken && !rescue) value -= 90;
    }
    // 别在自己已经围住的地方补子
    if (!taken && !rescue && !eye && neighbors.filter(p => board.get(p) === side).length >= 3) value -= 90;

    graded.push({ ...m, value, taken, saving: rescue > 0, atari, eye });
  }

  const deep = analysis ? 0 : [0, 8, 12, 18, 26][level - 1];
  graded.sort((a, b) => b.value - a.value);
  if (deep) for (const candidate of graded.slice(0, deep)) {
    if (performance.now() > deadline) break;
    const next = board.makeMove(side, candidate.to);
    const spots = new Set();
    for (const p of [candidate.to, ...next.getNeighbors(candidate.to)]) {
      if (next.get(p) !== side) continue;
      for (const liberty of next.getLiberties(p)) spots.add(liberty.join(','));
    }
    let threat = 0;
    for (const key of spots) {
      const point = key.split(',').map(Number);
      const reply = next.analyzeMove(-side, point);
      if (reply.overwrite || reply.suicide || reply.ko) continue;
      const after = next.makeMove(-side, point);
      const gained = after.getCaptures(-side) - next.getCaptures(-side);
      if (gained > threat) threat = gained;
    }
    candidate.value -= threat * 260;
  }
  graded.sort((a, b) => b.value - a.value);

  let selected = graded[0] || legal.find(m => m.pass);
  const best = graded[0]?.value ?? -1e9;
  if ((match.passes === 1 && empty < n * n * .45 && best < 100) || !graded.length || best < -120) {
    selected = legal.find(m => m.pass) || selected;
    graded.unshift({ ...selected, value: 0 });
  } else if (!analysis && level <= 2) {
    const counts = [15, 8, 4, 2, 1];
    const pool = graded.filter(m => m.value >= best - [150, 65, 30, 12, 0][level - 1]).slice(0, counts[level - 1]);
    selected = choice(pool.length ? pool : [graded[0]]);
  }

  let score = 0;
  const seen = new Set();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (board.get([x, y]) && !seen.has(`${x},${y}`)) {
    const chain = board.getChain([x, y]), libs = board.getLiberties([x, y]).length, s = board.get([x, y]);
    chain.forEach(p => seen.add(p.join(',')));
    score += s * chain.length * (libs === 1 ? -35 : 12);
  }
  if (empty < n * n * .35) { const area = match.areaScore(); score = (area.black - area.white) * 25; }
  return { ranked: graded, selected, value: score, nodes, depth: deep ? 2 : 1 };
}

function explanation(match, candidate) {
  if (!candidate) return '本局已经结束，可以再来一局，尝试不同走法。';
  if (candidate.pass) return '暂时没有明显获益的落点，可停一手，与对手确认终局。';
  if (match.kind === 'gomoku') {
    if (candidate.attack >= 1000000) return '这里可以直接连成五子，是当前的制胜落点。';
    if (candidate.defend >= 1000000) return '对方已经形成直接威胁，先堵住这一个关键点。';
    if (candidate.attack >= 2000) return '延伸已有棋形，争取制造两个方向的连续威胁。';
    return match.log.length ? '兼顾连子与防守，保留横向、纵向和斜线的延伸空间。' : '先占据天元附近，四个方向都有延伸空间。';
  }
  if (match.kind === 'go') {
    if (candidate.taken) return `这一步可以提掉 ${candidate.taken} 子，并改善周围棋形。`;
    if (candidate.saving) return '这块棋只剩一口气，优先连接或补气。';
    if (candidate.atari) return '压缩对方气数，同时注意自己的连接与眼位。';
    return '兼顾棋块的气与连接，开局优先占角、守住重要边线。';
  }
  if (match.check) return '当前正在被将军，必须先应将；候选着已通过合法性校验。';
  if (candidate.capture) return '优先考察吃子后的子力交换，也要留意对方的反击。';
  if (candidate.promotion) return '兵已抵达底线，升变后能显著增强子力。';
  return match.kind === 'chess' ? '发展子力、争夺中心，同时保持王的安全。' : '协调车马炮的活动空间，兼顾中路与将帅安全。';
}

export function analyze(data, level = 3, analysis = false) {
  const match = new Match(data);
  if (match.result || match.scoring) {
    const value = match.result?.winner ? match.result.winner * 2000 : 0;
    return { move: null, suggestions: [], value, balance: match.result?.winner === 1 ? 100 : match.result?.winner === -1 ? 0 : 50,
      title: match.scoring && !match.result ? '双方停着，进入数子' : match.result?.winner ? `${sideName(match.kind, match.result.winner)}获胜` : '握手言和',
      summary: match.scoring && !match.result ? '标记双方同意的死子，然后确认数子结果；有争议可以继续对弈。' : `本局${match.result?.reason || '已结束'}。可以再开一局，尝试不同走法。`,
      source: 'local', nodes: 0, depth: 0 };
  }
  level = clamp(Number(level) || 3, 1, 5);
  const result = match.kind === 'gomoku' ? gomokuSearch(match, level, analysis)
    : match.kind === 'go' ? goSearch(match, level, analysis) : pieceSearch(match, level, analysis);
  const balance = Math.round(clamp(50 + 46 * Math.tanh(result.value / 550), 4, 96));
  const leading = Math.abs(balance - 50) < 6 ? '局面较为均衡' : `${sideName(match.kind, balance > 50 ? 1 : -1)}${Math.abs(balance - 50) > 25 ? '优势明显' : '略有主动'}`;
  return {
    move: result.selected?.id, value: Math.round(result.value), balance,
    suggestions: result.ranked.slice(0, 3).map((m, i) => ({ id: m.id, to: m.to, from: m.from, label: m.label, rank: i + 1, reason: explanation(match, m) })),
    title: match.check ? `${sideName(match.kind, match.turn)}正在被将军` : leading,
    summary: explanation(match, result.ranked[0]), source: 'local', nodes: result.nodes, depth: result.depth,
    game: GAMES[match.kind].name,
  };
}
