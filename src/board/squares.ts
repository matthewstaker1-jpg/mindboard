// Pure square/orientation geometry and FEN placement parsing. No React here,
// so every mapping can be unit tested directly.

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type File = (typeof FILES)[number];
export type Rank = (typeof RANKS)[number];
export type Square = `${File}${Rank}`;
export type Orientation = 'white' | 'black';

export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
/** FEN letter: uppercase is White, lowercase is Black. */
export type Piece = PieceType | Uppercase<PieceType>;

/** Screen position: row 0 is the top edge, col 0 the left edge. */
export interface ScreenPos {
  row: number;
  col: number;
}

export const ALL_SQUARES: readonly Square[] = RANKS.flatMap((r) => FILES.map((f) => `${f}${r}` as Square));

export function isSquare(s: string): s is Square {
  return /^[a-h][1-8]$/.test(s);
}

export function fileIndex(sq: Square): number {
  return sq.charCodeAt(0) - 97;
}

export function rankOf(sq: Square): Rank {
  return Number(sq[1]) as Rank;
}

/** The square drawn at a screen position for the given orientation. */
export function squareAt(row: number, col: number, orientation: Orientation): Square {
  if (row < 0 || row > 7 || col < 0 || col > 7 || !Number.isInteger(row) || !Number.isInteger(col)) {
    throw new RangeError(`Screen position out of range: row ${row}, col ${col}`);
  }
  const f = orientation === 'white' ? col : 7 - col;
  const r = orientation === 'white' ? 8 - row : row + 1;
  return `${FILES[f]}${r}` as Square;
}

/** Where a square is drawn on screen for the given orientation. */
export function screenPos(sq: Square, orientation: Orientation): ScreenPos {
  const f = fileIndex(sq);
  const r = rankOf(sq);
  return orientation === 'white' ? { row: 8 - r, col: f } : { row: r - 1, col: 7 - f };
}

/** All 64 squares in screen reading order (top-left to bottom-right). */
export function squaresInScreenOrder(orientation: Orientation): Square[] {
  const out: Square[] = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) out.push(squareAt(row, col, orientation));
  return out;
}

/** a1 is dark and h1 is light ("light on the right"). */
export function isLightSquare(sq: Square): boolean {
  return (fileIndex(sq) + rankOf(sq)) % 2 === 0;
}

/** The square a given square appears on when the board is flipped. */
export function mirrorSquare(sq: Square): Square {
  return `${FILES[7 - fileIndex(sq)]}${9 - rankOf(sq)}` as Square;
}

export function isWhitePiece(p: Piece): boolean {
  return p === p.toUpperCase();
}

/**
 * Parse the piece-placement field of a FEN. Accepts a full FEN or just the
 * placement field. Throws on malformed input.
 */
export function parsePlacement(fen: string): Map<Square, Piece> {
  const placement = fen.trim().split(/\s+/)[0] ?? '';
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error(`FEN must have 8 ranks, got ${rows.length}: "${fen}"`);
  const out = new Map<Square, Piece>();
  rows.forEach((row, i) => {
    const rank = 8 - i;
    let f = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        f += Number(ch);
      } else if (/^[kqrbnpKQRBNP]$/.test(ch)) {
        if (f > 7) throw new Error(`FEN rank ${rank} has more than 8 files: "${fen}"`);
        out.set(`${FILES[f]}${rank}` as Square, ch as Piece);
        f++;
      } else {
        throw new Error(`Bad FEN character "${ch}" in rank ${rank}: "${fen}"`);
      }
    }
    if (f !== 8) throw new Error(`FEN rank ${rank} has ${f} files, expected 8: "${fen}"`);
  });
  return out;
}

export const EMPTY_FEN = '8/8/8/8/8/8/8/8';

/** Build a placement-only FEN from a square → piece map (e.g. a lone knight). */
export function placementFen(pieces: Partial<Record<Square, Piece>>): string {
  const rows: string[] = [];
  for (let r = 8; r >= 1; r--) {
    let row = '';
    let empty = 0;
    for (const f of FILES) {
      const p = pieces[`${f}${r}` as Square];
      if (p) {
        if (empty) row += empty;
        row += p;
        empty = 0;
      } else empty++;
    }
    rows.push(row + (empty ? empty : ''));
  }
  return rows.join('/');
}

/**
 * The square under a point, given in pixels from the board's top-left corner
 * on a board `size` pixels wide. Null when the point is off the board.
 */
export function squareFromPoint(x: number, y: number, size: number, orientation: Orientation): Square | null {
  if (!(size > 0) || x < 0 || y < 0 || x >= size || y >= size) return null;
  const cell = size / 8;
  return squareAt(Math.floor(y / cell), Math.floor(x / cell), orientation);
}
