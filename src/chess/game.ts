// chess.js wrapper. Everything the drills need to know about real positions
// and moves lives here, out of React.

import { Chess, type Move } from 'chess.js';
import type { Piece, Square } from '../board/squares';
import { OPENING_LINES, PROMOTION_FENS } from './openings';

export type Color = 'w' | 'b';

/** One move from the bank, with the position before it. */
export interface BankMove {
  fenBefore: string;
  fenAfter: string;
  san: string;
  from: Square;
  to: Square;
  color: Color;
  piece: Move['piece'];
  captured?: Move['captured'];
  promotion?: Move['promotion'];
  /** Full-move number of this move, e.g. 3 for 3…Bb4. */
  moveNumber: number;
  isCapture: boolean;
  isCheck: boolean;
  isCastle: boolean;
  isPromotion: boolean;
  opening: string;
}

function toBankMove(m: Move, moveNumber: number, opening: string): BankMove {
  return {
    fenBefore: m.before,
    fenAfter: m.after,
    san: m.san,
    from: m.from as Square,
    to: m.to as Square,
    color: m.color,
    piece: m.piece,
    captured: m.captured,
    promotion: m.promotion,
    moveNumber,
    isCapture: m.isCapture() || m.isEnPassant(),
    isCheck: m.san.includes('+') || m.san.includes('#'),
    isCastle: m.isKingsideCastle() || m.isQueensideCastle(),
    isPromotion: m.isPromotion(),
    opening,
  };
}

/** Replay a line, throwing on the first illegal move. */
export function replayLine(moves: string[], opening = ''): BankMove[] {
  const chess = new Chess();
  return moves.map((san) => {
    const moveNumber = chess.moveNumber();
    let m: Move;
    try {
      m = chess.move(san);
    } catch {
      throw new Error(`Illegal move "${san}" in ${opening || 'line'} at move ${moveNumber}`);
    }
    return toBankMove(m, moveNumber, opening);
  });
}

let bankCache: BankMove[] | null = null;

/** Every move of every opening line, plus every promotion from the promotion positions. */
export function moveBank(): BankMove[] {
  if (bankCache) return bankCache;
  const out: BankMove[] = [];
  for (const line of OPENING_LINES) out.push(...replayLine(line.moves, line.name));
  for (const fen of PROMOTION_FENS) {
    const chess = new Chess(fen);
    for (const m of chess.moves({ verbose: true })) {
      if (m.isPromotion()) out.push(toBankMove(m, chess.moveNumber(), 'Endgame'));
    }
  }
  bankCache = out;
  return out;
}

/** "3.Nf3" for White, "3…Bb4" for Black. */
export function numberedSan(m: Pick<BankMove, 'moveNumber' | 'color' | 'san'>): string {
  return `${m.moveNumber}${m.color === 'w' ? '.' : '…'}${m.san}`;
}

export const PIECE_NAME: Record<string, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

/** "Nc3", "Ke1", or "d2 pawn" — how a piece on a square is written in the bonus question. */
export function pieceLabel(piece: Piece | string, sq: Square): string {
  const t = piece.toLowerCase();
  return t === 'p' ? `${sq} pawn` : `${t.toUpperCase()}${sq}`;
}

/** Enemy pieces the piece standing on `from` attacks in this position. */
export function attackedEnemies(fen: string, from: Square): { square: Square; piece: string }[] {
  const chess = new Chess(fen);
  const me = chess.get(from);
  if (!me) return [];
  const out: { square: Square; piece: string }[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color === me.color) continue;
      if (chess.attackers(cell.square, me.color).includes(from)) {
        out.push({ square: cell.square as Square, piece: cell.type });
      }
    }
  }
  return out;
}

/** Enemy pieces in this position that `from` does not attack. */
export function unattackedEnemies(fen: string, from: Square): { square: Square; piece: string }[] {
  const chess = new Chess(fen);
  const me = chess.get(from);
  if (!me) return [];
  const hit = new Set(attackedEnemies(fen, from).map((a) => a.square));
  const out: { square: Square; piece: string }[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color !== me.color && !hit.has(cell.square as Square)) {
        out.push({ square: cell.square as Square, piece: cell.type });
      }
    }
  }
  return out;
}
