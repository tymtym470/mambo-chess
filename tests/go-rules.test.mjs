import test from 'node:test';
import assert from 'node:assert/strict';
import { freshGame, goResult, Match } from '../src/game.js';

function replay(moves, extra = {}) {
  return new Match({ ...freshGame('go', 9), moves, ...extra });
}

test('围棋边角提子会移除无气的白子并计入黑方提子', () => {
  const match = replay(['1,0', '0,0', '0,1']);

  assert.equal(match.engine.get([0, 0]), 0);
  assert.equal(match.engine.getCaptures(1), 1);
  assert.equal(match.log.at(-1).captured, 1);
});

test('连续两次停着进入终局数子阶段', () => {
  const match = replay(['pass', 'pass']);

  assert.equal(match.scoring, true);
  assert.equal(match.result, null);
  assert.deepEqual(match.legalMoves(), []);
});

test('数子结果包含地盘、提子、贴目和明确的胜负差', () => {
  const match = replay([
    '1,0', '8,8',
    '0,1', '7,8',
    '2,0', '6,8',
    '0,2', '5,8',
    '2,1', '4,8',
    '1,2', '3,8',
  ]);
  const score = match.areaScore([]);

  assert.equal(score.prisoners.black, 0);
  assert.equal(score.prisoners.white, 0);
  assert.equal(score.territory.black, 1);
  assert.equal(score.territory.white, 0);
  assert.equal(score.black, 1);
  assert.equal(score.white, 6.5);

  const finished = new Match({
    ...freshGame('go', 9),
    moves: [...match.log.map(move => move.id), 'pass', 'pass'],
    scoreAccepted: true,
  });
  assert.equal(finished.result.winner, -1);
  assert.equal(finished.result.margin, 5.5);
  assert.match(finished.result.reason, /^白胜 5\.5 目$/);
});

test('相等分数返回和棋而不是强行判给白方', () => {
  assert.deepEqual(goResult({ black: 10, white: 10 }), {
    winner: 0,
    margin: 0,
    reason: '数子结束 · 和棋',
  });
});
