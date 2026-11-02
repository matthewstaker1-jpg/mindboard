import { describe, expect, it } from 'vitest';
import {
  ALL_SQUARES,
  EMPTY_FEN,
  isLightSquare,
  isSquare,
  mirrorSquare,
  parsePlacement,
  placementFen,
  screenPos,
  squareAt,
  squareFromPoint,
  squaresInScreenOrder,
  type Orientation,
} from './squares';

const BOTH: Orientation[] = ['white', 'black'];

describe('orientation', () => {
  it("g3 on Black's view sits where b6 sits on White's", () => {
    expect(screenPos('g3', 'black')).toEqual(screenPos('b6', 'white'));
    expect(squareAt(2, 1, 'white')).toBe('b6');
    expect(squareAt(2, 1, 'black')).toBe('g3');
  });

  it('puts the right corners at the top-left and bottom-right', () => {
    expect(squareAt(0, 0, 'white')).toBe('a8');
    expect(squareAt(7, 7, 'white')).toBe('h1');
    expect(squareAt(0, 0, 'black')).toBe('h1');
    expect(squareAt(7, 7, 'black')).toBe('a8');
  });

  it("keeps each side's own pieces at the bottom", () => {
    expect(screenPos('e1', 'white').row).toBe(7);
    expect(screenPos('e8', 'black').row).toBe(7);
    // a1 is bottom-left for White and top-right for Black.
    expect(screenPos('a1', 'white')).toEqual({ row: 7, col: 0 });
    expect(screenPos('a1', 'black')).toEqual({ row: 0, col: 7 });
  });

  it('flipping maps every square to its mirror', () => {
    for (const sq of ALL_SQUARES) {
      expect(screenPos(sq, 'black')).toEqual(screenPos(mirrorSquare(sq), 'white'));
      expect(mirrorSquare(mirrorSquare(sq))).toBe(sq);
    }
  });
});

describe('square mapping', () => {
  it.each(BOTH)('squareAt and screenPos are inverses (%s)', (o) => {
    for (const sq of ALL_SQUARES) {
      const { row, col } = screenPos(sq, o);
      expect(squareAt(row, col, o)).toBe(sq);
    }
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) expect(screenPos(squareAt(row, col, o), o)).toEqual({ row, col });
  });

  it.each(BOTH)('screen order covers all 64 squares exactly once (%s)', (o) => {
    const order = squaresInScreenOrder(o);
    expect(order).toHaveLength(64);
    expect(new Set(order).size).toBe(64);
    order.forEach((sq, i) => expect(screenPos(sq, o)).toEqual({ row: Math.floor(i / 8), col: i % 8 }));
  });

  it('rejects positions off the board', () => {
    expect(() => squareAt(8, 0, 'white')).toThrow(RangeError);
    expect(() => squareAt(0, -1, 'black')).toThrow(RangeError);
    expect(() => squareAt(0.5, 0, 'white')).toThrow(RangeError);
  });

  it('colours squares with a1 dark and h1 light', () => {
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('h1')).toBe(true);
    expect(isLightSquare('a8')).toBe(true);
    expect(isLightSquare('d1')).toBe(true);
    expect(isLightSquare('e1')).toBe(false);
    expect(ALL_SQUARES.filter(isLightSquare)).toHaveLength(32);
  });

  it('a square keeps its colour in either orientation', () => {
    // The bottom-right corner is light from both sides.
    expect(isLightSquare(squareAt(7, 7, 'white'))).toBe(true);
    expect(isLightSquare(squareAt(7, 7, 'black'))).toBe(true);
  });

  it('recognises valid square names', () => {
    expect(isSquare('e4')).toBe(true);
    expect(isSquare('i1')).toBe(false);
    expect(isSquare('a9')).toBe(false);
    expect(isSquare('E4')).toBe(false);
  });
});

describe('squareFromPoint', () => {
  it('maps pixels to squares in both orientations', () => {
    expect(squareFromPoint(10, 10, 400, 'white')).toBe('a8');
    expect(squareFromPoint(399, 399, 400, 'white')).toBe('h1');
    expect(squareFromPoint(10, 10, 400, 'black')).toBe('h1');
    // b6's slot on White's view is g3 on Black's.
    expect(squareFromPoint(75, 125, 400, 'white')).toBe('b6');
    expect(squareFromPoint(75, 125, 400, 'black')).toBe('g3');
  });

  it('returns null off the board', () => {
    expect(squareFromPoint(-1, 10, 400, 'white')).toBeNull();
    expect(squareFromPoint(10, 400, 400, 'white')).toBeNull();
    expect(squareFromPoint(10, 10, 0, 'white')).toBeNull();
  });
});

describe('parsePlacement', () => {
  it('reads the start position', () => {
    const p = parsePlacement('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(p.size).toBe(32);
    expect(p.get('e1')).toBe('K');
    expect(p.get('d8')).toBe('q');
    expect(p.get('a2')).toBe('P');
    expect(p.get('e4')).toBeUndefined();
  });

  it('reads the Italian after 4…Nf6', () => {
    const p = parsePlacement('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R');
    expect(p.get('c4')).toBe('B');
    expect(p.get('f3')).toBe('N');
    expect(p.get('f6')).toBe('n');
    expect(p.get('c5')).toBe('b');
    expect(p.get('c3')).toBe('P');
    expect(p.get('g8')).toBeUndefined();
  });

  it('round-trips through placementFen', () => {
    expect(placementFen({})).toBe(EMPTY_FEN);
    expect(placementFen({ b1: 'N' })).toBe('8/8/8/8/8/8/8/1N6');
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R';
    expect(placementFen(Object.fromEntries(parsePlacement(fen)))).toBe(fen);
  });

  it('reads an empty board', () => {
    expect(parsePlacement(EMPTY_FEN).size).toBe(0);
  });

  it('rejects malformed FENs', () => {
    expect(() => parsePlacement('8/8/8')).toThrow();
    expect(() => parsePlacement('9/8/8/8/8/8/8/8')).toThrow();
    expect(() => parsePlacement('7/8/8/8/8/8/8/8')).toThrow();
    expect(() => parsePlacement('8/8/8/8/8/8/8/7x')).toThrow();
    expect(() => parsePlacement('8/8/8/8/8/8/8/8K')).toThrow();
  });
});
