import { describe, expect, it } from 'vitest';
import { parseMove } from './san';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// 1.e4 d5: White can play exd5.
const SCANDI = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
// Both castles available for White.
const CASTLES = 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 6 8';
// Knights on b1 and f3 can both reach d2.
const TWO_KNIGHTS = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4';
// White pawn on b7 can promote; bishop on c4 too.
const PROMO = 'r3k3/1P6/8/8/2B5/8/8/4K3 w - - 0 1';

const san = (input: string, fen: string) => {
  const r = parseMove(input, fen);
  return r.kind === 'ok' ? r.move.san : r.kind;
};

describe('parseMove', () => {
  it('reads standard and lowercase SAN', () => {
    expect(san('Nf3', START)).toBe('Nf3');
    expect(san('nf3', START)).toBe('Nf3');
    expect(san('e4', START)).toBe('e4');
    expect(san('E4', START)).toBe('unreadable');
  });

  it('reads coordinates', () => {
    expect(san('g1f3', START)).toBe('Nf3');
    expect(san('g1-f3', START)).toBe('Nf3');
    expect(san('e2e4', START)).toBe('e4');
  });

  it('forgives missing x, check signs and pawn shorthand', () => {
    expect(san('exd5', SCANDI)).toBe('exd5');
    expect(san('ed5', SCANDI)).toBe('exd5');
    expect(san('Qh5+', START)).toBe('illegal');
    expect(san('e4+', START)).toBe('e4');
  });

  it('reads every way of writing castling', () => {
    for (const s of ['O-O', '0-0', 'o-o', 'OO', 'oo']) expect(san(s, CASTLES)).toBe('O-O');
    for (const s of ['O-O-O', '0-0-0', 'o-o-o']) expect(san(s, CASTLES)).toBe('O-O-O');
    expect(san('O-O', START)).toBe('illegal');
  });

  it('asks when the move is ambiguous, and takes disambiguation', () => {
    const r = parseMove('Nd2', TWO_KNIGHTS);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.options.map((m) => m.san).sort()).toEqual(['Nbd2', 'Nfd2']);
    expect(san('Nbd2', TWO_KNIGHTS)).toBe('Nbd2');
    expect(san('N1d2', TWO_KNIGHTS)).toBe('Nbd2');
  });

  it('handles the bishop / b-file clash', () => {
    // "bc4"-style: only the bishop can reach it here.
    expect(san('bd5', PROMO)).toBe('Bd5');
    expect(san('Bd5', PROMO)).toBe('Bd5');
  });

  it('promotes, defaulting to a queen', () => {
    expect(san('b8=Q', PROMO)).toBe('b8=Q+');
    expect(san('b8', PROMO)).toBe('b8=Q+');
    expect(san('b8N', PROMO)).toBe('b8=N');
    expect(san('bxa8=R', PROMO)).toBe('bxa8=R+');
    expect(san('ba8', PROMO)).toBe('bxa8=Q+');
    expect(san('b7b8n', PROMO)).toBe('b8=N');
  });

  it('rejects illegal and unreadable input', () => {
    expect(san('Ke3', START)).toBe('illegal');
    expect(san('hello', START)).toBe('unreadable');
    expect(san('', START)).toBe('unreadable');
  });
});
