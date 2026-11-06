import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Plus, Cpu, Users } from 'lucide-react';
import Board from './Board.jsx';
import { advance, freshGame, GAMES, Match, sideName, undo } from './game.js';

/**
 * 分屏第二块棋盘：独立的一局棋。
 * 只带最小闭环（换棋种、新局、悔棋、AI/双人），分析和侧栏留给主视图，
 * 这样两块棋盘可以各下各的，互不干扰。
 */
export default function MiniGame({ seed, onClose, level = 5 }) {
  const [game, setGame] = useState(() => (seed ? { ...seed } : freshGame('gomoku')));
  const [selected, setSelected] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [twoPlayer, setTwoPlayer] = useState(false);
  const workerRef = useRef(null);
  const match = useMemo(() => new Match(game), [game]);
  const isAiTurn = !twoPlayer && match.turn === -1 && !match.result && !match.scoring;
  const canPlay = !match.result && !match.scoring && !isAiTurn && !thinking;

  useEffect(() => {
    if (!isAiTurn) { setThinking(false); return undefined; }
    let cancelled = false;
    setThinking(true);
    const timer = setTimeout(() => {
      const worker = new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = ({ data }) => {
        worker.terminate();
        workerRef.current = null;
        if (cancelled) return;
        if (data.result?.move) {
          try { setGame(next => advance(next, data.result.move).data); } catch { /* 引擎给了非法着法，忽略 */ }
        }
        setThinking(false);
      };
      worker.onerror = () => { setThinking(false); worker.terminate(); workerRef.current = null; };
      worker.postMessage({ game, level, analysis: false });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); workerRef.current?.terminate(); workerRef.current = null; };
  }, [game, isAiTurn, level]);

  function play(id) {
    try {
      const next = advance(game, id);
      setGame(next.data);
      setSelected(null);
    } catch { /* 非法着法：保持原状 */ }
  }

  function cell(point) {
    if (!canPlay) return;
    const [x, y] = point;
    const piece = match.cells[y]?.[x];
    if (game.kind === 'go' || game.kind === 'gomoku') { play(`${x},${y}`); return; }
    if (piece?.side === match.turn) { setSelected(prev => (prev && prev[0] === x && prev[1] === y ? null : point)); return; }
    if (!selected) return;
    const move = match.legalMoves().find(m => m.from?.[0] === selected[0] && m.from?.[1] === selected[1] && m.to?.[0] === x && m.to?.[1] === y);
    if (move) play(move.id);
  }

  const resultLabel = match.result
    ? (match.result.winner === 0 ? '和棋' : `${sideName(game.kind, match.result.winner)}获胜`)
    : match.scoring ? '双方停着' : `${sideName(game.kind, match.turn)}落子`;

  return (
    <section className="play-area mini-pane" aria-label="分屏对局">
      <div className="board-heading">
        <div>
          <h2>{GAMES[game.kind].name}</h2>
          <span>{game.size} × {game.size}</span>
        </div>
        <div className="board-top-actions">
          <select
            aria-label="分屏棋种"
            value={game.kind}
            onChange={e => { setGame(freshGame(e.target.value)); setSelected(null); }}
          >
            {Object.entries(GAMES).map(([kind, info]) => <option key={kind} value={kind}>{info.name}</option>)}
          </select>
          <button className="icon-button" onClick={() => setTwoPlayer(v => !v)} title={twoPlayer ? '切到人机' : '切到双人'} aria-label={twoPlayer ? '切到人机' : '切到双人'}>
            {twoPlayer ? <Cpu size={16} /> : <Users size={16} />}
          </button>
          <button className="icon-button" onClick={() => setGame(freshGame(game.kind, game.kind === 'go' ? game.size : undefined))} title="新开一局" aria-label="新开一局"><Plus size={16} /></button>
          <button className="icon-button" onClick={() => { setGame(g => undo(g, twoPlayer ? 'human' : 'ai', 1)); setSelected(null); }} title="悔棋" aria-label="悔棋"><RotateCcw size={16} /></button>
          {onClose && <button className="icon-button" onClick={onClose} title="关闭分屏" aria-label="关闭分屏">×</button>}
        </div>
      </div>
      <div className={`board-glass glass ${thinking ? 'thinking' : ''}`}>
        <Board match={match} selected={selected} onCell={cell} hint={null} flipped={false} numbers={false} disabled={!canPlay} dead={game.dead || []} />
      </div>
      <div className="board-toolbar">
        <span className="board-turn-status">{thinking ? 'AI 正在想…' : resultLabel}</span>
        <span className="board-footnote-inline">{GAMES[game.kind].rule}</span>
      </div>
    </section>
  );
}
