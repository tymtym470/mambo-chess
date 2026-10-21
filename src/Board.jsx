import React from 'react';
import { CHESS_GLYPHS, CHESS_NAMES, PIECE_NAMES, coord, sideName } from './game.js';

export function GameGlyph({ kind }) {
  if (kind === 'chess') return <span className="game-piece-glyph">♞</span>;
  if (kind === 'xiangqi') return <span className="game-xq-glyph">帅</span>;
  return <svg viewBox="0 0 48 48" aria-hidden="true" className="game-grid-glyph">
    <path d="M9 8v32M24 8v32M39 8v32M8 9h32M8 24h32M8 39h32" fill="none" stroke="currentColor" strokeWidth=".8" opacity=".35"/>
    {kind === 'gomoku' ? <><circle cx="9" cy="9" r="5.5" fill="#465b52"/><circle cx="24" cy="24" r="5.5" fill="#465b52"/><circle cx="39" cy="39" r="5.5" fill="#465b52"/><circle cx="9" cy="24" r="5" fill="#fff" stroke="#9ca8a2"/></>
      : <><circle cx="9" cy="9" r="6" fill="#465b52"/><circle cx="24" cy="9" r="6" fill="#fff" stroke="#9ca8a2"/><circle cx="24" cy="24" r="6" fill="#465b52"/><circle cx="39" cy="24" r="6" fill="#fff" stroke="#9ca8a2"/><circle cx="9" cy="39" r="6" fill="#465b52"/></>}
  </svg>;
}

export default function Board({ match, selected, onCell, hint, flipped, numbers, disabled, dead = [] }) {
  const { kind, size, rows, cells, log } = match;
  const isChess = kind === 'chess', xq = kind === 'xiangqi';
  const padding = isChess ? 28 : kind === 'go' ? 26 : 44;
  const step = (640 - padding * 2) / (isChess ? size : size - 1);
  const height = isChess ? 640 : padding * 2 + (rows - 1) * step;
  const convert = ([x, y]) => flipped ? [size - 1 - x, rows - 1 - y] : [x, y];
  const pos = (point) => {
    const [x, y] = convert(point);
    return [padding + step * (x + (isChess ? .5 : 0)), padding + step * (y + (isChess ? .5 : 0))];
  };
  const last = log.at(-1);
  const legal = selected ? match.legalMoves().filter(m => m.from?.[0] === selected[0] && m.from?.[1] === selected[1]) : [];
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  const stars = size === 15 ? [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]] : size === 9
    ? [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]] : size === 13
      ? [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]]
      : [3, 9, 15].flatMap(x => [3, 9, 15].map(y => [x, y]));
  return <div className={`board-surface ${isChess ? 'chess-surface' : ''} ${xq ? 'xiangqi-surface' : ''}`} data-testid="board">
    <svg className="board-svg" viewBox={`0 0 640 ${height}`} role="group" aria-label={`${match.kind} 棋盘`} style={{ aspectRatio: `640 / ${height}` }}>
      <defs>
        <radialGradient id="black-stone" cx=".32" cy=".24" r=".75"><stop stopColor="#7d8a84"/><stop offset=".42" stopColor="#33403a"/><stop offset="1" stopColor="#1a2320"/></radialGradient>
        <radialGradient id="white-stone" cx=".32" cy=".25" r=".8"><stop stopColor="#fffef9"/><stop offset=".55" stopColor="#f7f3e8"/><stop offset="1" stopColor="#d3c9b4"/></radialGradient>
        <linearGradient id="xq-piece" x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#fffdf6"/><stop offset="1" stopColor="#e9dcc2"/></linearGradient>
        <filter id="stone-shadow" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#2d5040" floodOpacity=".25"/></filter>
      </defs>
      {isChess ? <g>{Array.from({ length: 64 }, (_, i) => {
        const x = i % 8, y = Math.floor(i / 8);
        return <rect key={i} x={padding + x * step} y={padding + y * step} width={step + .3} height={step + .3} fill={(x + y) % 2 ? '#c2a273' : '#f2e3c6'}/>;
      })}</g> : <g stroke="#637c70" strokeWidth="1" opacity=".46">
        {Array.from({ length: rows }, (_, y) => <line key={`h${y}`} x1={padding} y1={padding + y * step} x2={640 - padding} y2={padding + y * step}/>)}
        {Array.from({ length: size }, (_, x) => xq && x > 0 && x < 8
          ? <path key={x} d={`M${padding + x * step} ${padding}V${padding + 4 * step}M${padding + x * step} ${padding + 5 * step}V${height - padding}`}/>
          : <line key={x} x1={padding + x * step} y1={padding} x2={padding + x * step} y2={height - padding}/>)}
        {xq && <path d={`M${padding + 3 * step} ${padding}l${2 * step} ${2 * step}m${-2 * step} 0l${2 * step} ${-2 * step}M${padding + 3 * step} ${padding + 7 * step}l${2 * step} ${2 * step}m${-2 * step} 0l${2 * step} ${-2 * step}`}/>}
      </g>}
      {xq && <g className="river-label" fill="#607d6c" fontSize="25" textAnchor="middle" opacity=".62"><text x="182" y={padding + 4.5 * step + 9}>楚 河</text><text x="458" y={padding + 4.5 * step + 9}>汉 界</text></g>}
      {!isChess && !xq && stars.map(([x, y]) => <circle key={`${x}-${y}`} cx={padding + x * step} cy={padding + y * step} r="3.5" fill="#5f786a" opacity=".68"/>)}
      <g fill="#86958c" fontSize={size > 15 ? 10 : 12} textAnchor="middle" className="board-coordinates">
        {Array.from({ length: size }, (_, x) => {
          const actual = flipped ? size - 1 - x : x;
          return <text key={`x${x}`} x={padding + step * (x + (isChess ? .5 : 0))} y={height - 10}>{isChess ? String.fromCharCode(97 + actual) : 'ABCDEFGHJKLMNOPQRST'[actual]}</text>;
        })}
        {Array.from({ length: rows }, (_, y) => <text key={`y${y}`} x="15" y={padding + step * (y + (isChess ? .5 : 0)) + 4}>{flipped ? y + 1 : rows - y}</text>)}
      </g>
      {cells.flatMap((row, y) => row.map((piece, x) => {
        const point = [x, y], [px, py] = pos(point);
        const isSelected = same(selected, point), isLast = same(last?.to, point);
        const isLegal = legal.some(m => same(m.to, point));
        const isHint = same(hint?.to, point);
        const isDead = dead.includes(`${x},${y}`);
        const isWin = match.winning?.some(p => same(p, point));
        const r = step * (xq ? .395 : .445);
        const number = numbers ? log.findLastIndex(m => same(m.to, point)) + 1 : 0;
        const title = `${coord(point, rows)}${piece ? ` ${sideName(kind, piece.side)} ${xq ? PIECE_NAMES[piece.side === 1 ? 'red' : 'black'][piece.role] : isChess ? CHESS_NAMES[piece.role] : '棋子'}` : ' 空位'}`;
        return <g key={`${x},${y}`} role="button" tabIndex={disabled && !match.scoring ? -1 : 0}
          aria-label={title} data-cell={`${x},${y}`} aria-disabled={disabled && !match.scoring}
          className={`board-cell ${piece ? 'occupied' : 'empty'} ${isSelected ? 'selected' : ''}`}
          onClick={() => onCell(point)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCell(point); } }}>
          <title>{title}</title>
          <rect x={px - step / 2} y={py - step / 2} width={step} height={step} fill="transparent" className="cell-hit"/>
          {isChess && (isLast || same(last?.from, point)) && <rect x={px - step / 2} y={py - step / 2} width={step} height={step} fill="#f4d890" opacity=".56" pointerEvents="none"/>}
          {isSelected && <circle cx={px} cy={py} r={r + 3} fill="#ed8a75" opacity=".38" stroke="#d76551" strokeWidth="2" pointerEvents="none"/>}
          {piece && <g pointerEvents="none" className={isLast ? 'piece piece-new' : 'piece'} style={{ transformOrigin: `${px}px ${py}px`, opacity: isDead ? .25 : 1 }}>
            {isChess ? <text x={px} y={py + 1} dominantBaseline="central" textAnchor="middle" fontSize={step * .82} className={`chess-piece ${piece.side === 1 ? 'light-piece' : 'dark-piece'}`} stroke={piece.side === 1 ? '#63756b' : '#24392d'} strokeWidth="1" paintOrder="stroke fill" fill={piece.side === 1 ? '#fffef7' : '#2a3d31'}>{CHESS_GLYPHS[piece.role]}</text>
              : <><circle cx={px} cy={py} r={r} fill={xq ? 'url(#xq-piece)' : piece.side === 1 ? 'url(#black-stone)' : 'url(#white-stone)'} filter="url(#stone-shadow)" stroke={xq ? '#c7d0c9' : piece.side === 1 ? '#34423a' : '#d7dfd9'} strokeWidth="1"/>
                {xq ? <><circle cx={px} cy={py} r={r - 4} stroke={piece.side === 1 ? '#be6154' : '#475e50'} strokeWidth=".9" fill="none"/><text x={px} y={py + 1} dominantBaseline="central" textAnchor="middle" fontFamily="'STKaiti','KaiTi',serif" fontSize={step * .49} fill={piece.side === 1 ? '#bb594b' : '#344b3d'}>{PIECE_NAMES[piece.side === 1 ? 'red' : 'black'][piece.role]}</text></>
                  : number ? <text x={px} y={py + 1} dominantBaseline="central" textAnchor="middle" fontSize={step * .37} fill={piece.side === 1 ? '#fff' : '#3e5646'}>{number}</text>
                    : isLast && <circle cx={px} cy={py} r={step * .09} fill="#ec927d"/>}
              </>}
          </g>}
          {isWin && <circle cx={px} cy={py} r={r + 3} fill="none" stroke="#d6826c" strokeWidth="3" pointerEvents="none"/>}
          {isLegal && <circle cx={px} cy={py} r={piece ? r + 3 : step * .13} fill={piece ? 'none' : '#426f55'} opacity=".6" stroke={piece ? '#d5826b' : 'none'} strokeWidth="3" pointerEvents="none"/>}
          {isHint && <g pointerEvents="none" className="hint-mark"><circle cx={px} cy={py} r={r} fill="#f19a80" fillOpacity=".28" stroke="#d87a60" strokeWidth="2" strokeDasharray="5 3"/><text x={px} y={py + 1} dominantBaseline="central" textAnchor="middle" fill="#aa533e" fontSize={step * .38}>1</text></g>}
          {!piece && !isHint && !isLegal && <circle className="hover-stone" cx={px} cy={py} r={r * .88} fill={match.turn === 1 ? '#365140' : '#fff'} opacity="0" pointerEvents="none"/>}
        </g>;
      }))}
    </svg>
  </div>;
}
