// Follow the moves: hear or read an opening line with no board, then answer
// questions about the position it reached. The classic blindfold exercise.

import { Chess, type Move } from 'chess.js';
import { FILES, type Square, isLightSquare } from '../board/squares';
import { PIECE_NAME } from '../chess/game';
import { OPENING_LINES } from '../chess/openings';
import type { Rng } from './queue';

export type FollowQuestion =
  | { kind: 'where'; prompt: string; options: Square[]; answers: Square[] }
  | { kind: 'whatsOn'; prompt: string; square: Square; options: string[]; answer: string };

export interface FollowRound {
  opening: string;
  moves: Move[];
  fen: string;
  questions: FollowQuestion[];
}

const SIDE = { w: 'White', b: 'Black' } as const;

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function pieceText(p: { color: 'w' | 'b'; type: string } | null | undefined): string {
  return p ? `${SIDE[p.color]} ${PIECE_NAME[p.type]}` : 'Empty';
}

/** "Where is White's light-squared bishop?" about a piece that has moved. */
function whereQuestion(chess: Chess, moves: Move[], rng: Rng, avoid: Set<string>): FollowQuestion | null {
  const board = chess.board().flat().filter((c) => c && c.type !== 'p' && c.type !== 'k');
  const moved = new Set(moves.map((m) => m.to));
  const pool = shuffle(
    board.filter((c) => c && moved.has(c.square) && !avoid.has(c.square)),
    rng,
  );
  const cell = pool[0] ?? shuffle(board.filter((c) => c && !avoid.has(c.square)), rng)[0];
  if (!cell) return null;
  const sq = cell.square as Square;
  avoid.add(sq);
  const same = board.filter((c) => c!.color === cell.color && c!.type === cell.type).map((c) => c!.square as Square);
  const answers = cell.type === 'b' ? [sq] : same;
  const name =
    cell.type === 'b'
      ? `${SIDE[cell.color]}'s ${isLightSquare(sq) ? 'light' : 'dark'}-squared bishop`
      : same.length > 1
        ? `one of ${SIDE[cell.color]}'s ${PIECE_NAME[cell.type]}s`
        : `${SIDE[cell.color]}'s ${PIECE_NAME[cell.type]}`;

  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]);
  const near: Square[] = [];
  for (let df = -2; df <= 2; df++)
    for (let dr = -2; dr <= 2; dr++) {
      const nf = f + df;
      const nr = r + dr;
      if (nf < 0 || nf > 7 || nr < 1 || nr > 8 || (df === 0 && dr === 0)) continue;
      const c = `${FILES[nf]}${nr}` as Square;
      if (answers.includes(c)) continue;
      if (cell.type === 'b' && isLightSquare(c) !== isLightSquare(sq)) continue;
      near.push(c);
    }
  return { kind: 'where', prompt: `Where is ${name}?`, options: shuffle([sq, ...shuffle(near, rng).slice(0, 3)], rng), answers };
}

/** "What's on f6?" about a square the moves touched. */
function whatsOnQuestion(chess: Chess, moves: Move[], rng: Rng, avoid: Set<string>): FollowQuestion | null {
  const touched = shuffle([...new Set(moves.flatMap((m) => [m.to, m.from]))].filter((s) => !avoid.has(s)), rng);
  const sq = touched[0] as Square | undefined;
  if (!sq) return null;
  avoid.add(sq);
  const here = chess.get(sq);
  const answer = pieceText(here);
  const pool = new Set<string>(['Empty']);
  for (const c of ['w', 'b'] as const) for (const t of ['n', 'b', 'r', 'q', 'p']) pool.add(pieceText({ color: c, type: t }));
  // Prefer near-misses: same piece other colour, same colour other piece.
  const close = here
    ? [pieceText({ color: here.color === 'w' ? 'b' : 'w', type: here.type }), 'Empty']
    : moves.filter((m) => m.from === sq).map((m) => pieceText({ color: m.color, type: m.piece }));
  const wrong = [...new Set([...close, ...shuffle([...pool], rng)])].filter((x) => x !== answer).slice(0, 3);
  return { kind: 'whatsOn', prompt: `What's on ${sq}?`, square: sq, options: shuffle([answer, ...wrong], rng), answer };
}

export function makeFollowRound(plies: number, rng: Rng): FollowRound {
  const lines = OPENING_LINES.filter((l) => l.moves.length >= Math.min(plies, 20));
  const line = lines[Math.floor(rng() * lines.length)] ?? OPENING_LINES[0]!;
  const n = Math.min(plies, line.moves.length);
  const chess = new Chess();
  const moves = line.moves.slice(0, n).map((san) => chess.move(san));
  const avoid = new Set<string>();
  const qs = [whereQuestion(chess, moves, rng, avoid), whatsOnQuestion(chess, moves, rng, avoid), whereQuestion(chess, moves, rng, avoid)];
  return { opening: line.name, moves, fen: chess.fen(), questions: qs.filter((q): q is FollowQuestion => q !== null) };
}

export function checkFollow(q: FollowQuestion, answer: string): boolean {
  return q.kind === 'where' ? q.answers.includes(answer as Square) : q.answer === answer;
}
