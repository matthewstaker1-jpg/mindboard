// Answer checking for the "write the move" drill. Deliberately strict about
// what matters for learning notation (piece letter, disambiguation, "x",
// promotion piece) and lenient about the rest (check signs, 0-0 vs O-O).
// The forgiving free-form parser for games is san.ts in Phase 2.

import { FILES, type Square } from '../board/squares';

export function normaliseSanAnswer(input: string): string {
  let s = input.trim().replace(/\s+/g, '');
  s = s.replace(/0/g, 'O').replace(/o/g, 'O'); // castling written with zeros or lowercase o
  s = s.replace(/[+#!?]+$/, '');
  return s;
}

export function sanMatches(input: string, san: string): boolean {
  return input.trim() !== '' && normaliseSanAnswer(input) === normaliseSanAnswer(san);
}

/** Squares a knight on `sq` can reach. */
export function knightTargets(sq: Square): Square[] {
  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]);
  const out: Square[] = [];
  for (const [df, dr] of [
    [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
  ] as const) {
    const nf = f + df;
    const nr = r + dr;
    if (nf >= 0 && nf < 8 && nr >= 1 && nr <= 8) out.push(`${FILES[nf]}${nr}` as Square);
  }
  return out;
}

/** Squares a knight can stop on to get from `from` to `to` in exactly two hops. */
export function knightMidpoints(from: Square, to: Square): Square[] {
  const reach = new Set(knightTargets(to));
  return knightTargets(from).filter((s) => reach.has(s));
}
