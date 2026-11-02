import { describe, expect, it } from 'vitest';
import { OPENING_LINES } from './openings';
import { attackedEnemies, moveBank, numberedSan, pieceLabel, replayLine } from './game';
import { knightMidpoints, knightTargets, normaliseSanAnswer, sanMatches } from './notation';

describe('opening bank', () => {
  it.each(OPENING_LINES.map((l, i) => [`${l.name} #${i}`, l] as const))('%s is legal', (_n, line) => {
    expect(() => replayLine(line.moves, line.name)).not.toThrow();
  });

  it('has enough of every move type for the levels', () => {
    const bank = moveBank();
    const quiet = bank.filter((m) => !m.isCapture && !m.isCheck && !m.isCastle && !m.isPromotion);
    expect(quiet.filter((m) => m.color === 'w').length).toBeGreaterThan(40);
    expect(bank.filter((m) => m.isCapture).length).toBeGreaterThan(20);
    expect(bank.filter((m) => m.isCheck).length).toBeGreaterThan(3);
    expect(bank.filter((m) => m.isCastle && m.color === 'w').length).toBeGreaterThan(3);
    expect(bank.filter((m) => m.isCastle && m.color === 'b').length).toBeGreaterThan(3);
    expect(bank.filter((m) => m.isPromotion && m.color === 'w').length).toBeGreaterThan(3);
    expect(bank.filter((m) => m.isPromotion && m.color === 'b').length).toBeGreaterThan(3);
    expect(bank.some((m) => m.san === 'O-O-O')).toBe(true);
  });

  it('numbers moves the way a scoresheet does', () => {
    const [, , , , , bb4] = replayLine('d4 Nf6 c4 e6 Nc3 Bb4'.split(' '));
    expect(numberedSan(bb4!)).toBe('3…Bb4');
    const [e4] = replayLine(['e4']);
    expect(numberedSan(e4!)).toBe('1.e4');
  });
});

describe('attacks', () => {
  it('finds what a bishop attacks after the Nimzo pin', () => {
    const moves = replayLine('d4 Nf6 c4 e6 Nc3 Bb4'.split(' '));
    const hit = attackedEnemies(moves.at(-1)!.fenAfter, 'b4').map((a) => pieceLabel(a.piece, a.square));
    expect(hit).toEqual(['Nc3']);
  });

  it('labels pawns by square', () => {
    expect(pieceLabel('p', 'd2')).toBe('d2 pawn');
    expect(pieceLabel('K', 'e1')).toBe('Ke1');
  });
});

describe('notation answers', () => {
  it('ignores check signs and accepts zeros for castling', () => {
    expect(sanMatches('Bb4', 'Bb4+')).toBe(true);
    expect(sanMatches('Bb4+', 'Bb4+')).toBe(true);
    expect(sanMatches('0-0', 'O-O')).toBe(true);
    expect(sanMatches('o-o-o', 'O-O-O')).toBe(true);
    expect(sanMatches(' Nf3 ', 'Nf3')).toBe(true);
  });

  it('is strict about what notation actually means', () => {
    expect(sanMatches('Nd4', 'Nxd4')).toBe(false);
    expect(sanMatches('Nd2', 'Nbd2')).toBe(false);
    expect(sanMatches('nf3', 'Nf3')).toBe(false);
    expect(sanMatches('e8', 'e8=Q')).toBe(false);
    expect(sanMatches('O-O', 'O-O-O')).toBe(false);
    expect(sanMatches('', 'e4')).toBe(false);
    expect(normaliseSanAnswer('Qh5#')).toBe('Qh5');
  });
});

describe('knight geometry', () => {
  it('lists knight moves inside the board', () => {
    expect(knightTargets('a1').sort()).toEqual(['b3', 'c2']);
    expect(knightTargets('d4')).toHaveLength(8);
  });

  it('finds the squares between two-hop routes', () => {
    expect(knightMidpoints('b1', 'e4').sort()).toEqual(['c3', 'd2']);
    expect(knightMidpoints('g1', 'g1').length).toBeGreaterThan(0); // there and back
    expect(knightMidpoints('a1', 'h8')).toEqual([]);
  });
});
