// Moves to spoken words, for reading moves aloud.
// "Bxf3+" with a knight captured → "bishop takes knight on F three, check".

import type { Move } from 'chess.js';
import { PIECE_NAME } from './game';

const NUMBER = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/** "f3" → "F three". Capital letters so speech engines say the letter, not a word ("a" → "uh"). */
export function squareWords(sq: string): string {
  return `${sq[0]!.toUpperCase()} ${NUMBER[Number(sq[1])]}`;
}

export function moveToWords(m: Pick<Move, 'san' | 'piece' | 'to' | 'captured' | 'promotion' | 'from'>): string {
  const tail = m.san.endsWith('#') ? ', checkmate' : m.san.endsWith('+') ? ', check' : '';
  if (m.san.startsWith('O-O-O')) return `castles queenside${tail}`;
  if (m.san.startsWith('O-O')) return `castles kingside${tail}`;
  const piece = PIECE_NAME[m.piece]!;
  const to = squareWords(m.to);
  const promo = m.promotion ? `, promotes to ${PIECE_NAME[m.promotion]}` : '';
  if (m.captured) {
    const who = m.piece === 'p' ? `${m.from[0]!.toUpperCase()} pawn` : piece;
    return `${who} takes ${PIECE_NAME[m.captured]} on ${to}${promo}${tail}`;
  }
  return `${piece} to ${to}${promo}${tail}`;
}

/** Short read-back of your own move before it's played: "Knight F three". */
export function readBack(m: Pick<Move, 'san' | 'piece' | 'to' | 'captured' | 'promotion' | 'from'>): string {
  const w = moveToWords(m);
  return w.charAt(0).toUpperCase() + w.slice(1);
}
