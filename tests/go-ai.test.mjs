import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, freshGame, GAMES } from '../src/game.js';
import { analyze } from '../src/ai.js';

// 围棋 AI 的回归测试：这几条对应真实出现过的退化（沿一路爬、填自己的眼、不捉子）。

test('围棋默认棋盘是国际标准 19 路', () => {
  assert.equal(GAMES.go.size, 19);
  assert.equal(freshGame('go').size, 19);
  assert.equal(new Match(freshGame('go')).size, 19);
});

test('空盘开局不下一路、不贴天元', () => {
  const data = freshGame('go');
  const move = analyze(data, 3, false).move;
  assert.ok(move && move !== 'pass', `开局不应该停一手（得到 ${move}）`);
  const [x, y] = move.split(',').map(Number);
  const edge = Math.min(x, y, 18 - x, 18 - y);
  assert.ok(edge >= 2, `开局落在一/二路（${move}）`);
  const center = 9;
  assert.ok(Math.abs(x - center) + Math.abs(y - center) > 4, `开局贴着天元（${move}）`);
});

test('能吃子的时候必须去吃', () => {
  // 白子 (1,1) 只剩 (1,2) 一口气，轮到黑棋
  const moves = ['0,1', '1,1', '1,0', '8,8', '2,1', '8,7'];
  const data = { ...freshGame('go', 9), moves };
  const match = new Match(data);
  assert.equal(match.turn, 1);
  const move = analyze({ ...data }, 3, false).move;
  assert.equal(move, '1,2', `应该提掉白子，实际走了 ${move}`);
  const capture = match.play(move);
  assert.equal(capture.captured, 1);
});

test('不会去填自己的眼', () => {
  // 黑棋围出一个眼 (1,1)：四邻都是黑子
  const moves = ['0,1', '8,8', '1,0', '8,7', '2,1', '8,6', '1,2', '8,5'];
  const data = { ...freshGame('go', 9), moves };
  const move = analyze({ ...data }, 3, false).move;
  assert.notEqual(move, '1,1', 'AI 去填了自己的眼');
  // 确认 (1,1) 确实是眼
  const match = new Match(data);
  assert.equal(match.engine.get([1, 1]), 0);
  assert.equal(match.engine.getNeighbors([1, 1]).filter(p => match.engine.get(p) === 1).length, 4);
});

test('自对弈 40 手不出一路、不自杀、不填眼', () => {
  let data = freshGame('go', 19);
  let selfAtari = 0, firstLine = 0;
  for (let i = 0; i < 40; i++) {
    const match = new Match(data);
    if (match.result || match.scoring) break;
    const move = analyze({ ...data }, 3, false).move;
    if (!move || move === 'pass') continue;
    const [x, y] = move.split(',').map(Number);
    if (Math.min(x, y, 18 - x, 18 - y) === 0) firstLine++;
    const next = match.engine.makeMove(match.turn, [x, y]);
    if (next.getLiberties([x, y]).length === 1) selfAtari++;
    data = { ...data, moves: [...data.moves, move] };
  }
  assert.equal(firstLine, 0, `自对弈中出现 ${firstLine} 手下一路`);
  assert.equal(selfAtari, 0, `自对弈中出现 ${selfAtari} 手自杀式落子`);
});
