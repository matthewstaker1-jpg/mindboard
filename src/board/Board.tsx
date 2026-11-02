import { useMemo } from 'react';
import {
  type Orientation,
  type Piece,
  type Square,
  isLightSquare,
  isWhitePiece,
  parsePlacement,
  screenPos,
  squaresInScreenOrder,
} from './squares';
import './Board.css';

export type HiddenMode = 'show' | 'ghost' | 'gone';
/** Either a per-square map, or a function of (square, piece). Only consulted for occupied squares. */
export type HiddenSpec = Partial<Record<Square, HiddenMode>> | ((sq: Square, piece: Piece) => HiddenMode);
export type Highlight = 'target' | 'from' | 'warn' | 'attacker';
/** 'dark' is the Stage 3 dark board: near-black squares, only lit tiles stand out. */
export type BoardTone = 'standard' | 'dark';

export interface BoardProps {
  fen: string;
  orientation?: Orientation;
  hidden?: HiddenSpec;
  highlights?: Partial<Record<Square, Highlight>>;
  /** Text drawn on a square in place of its piece, e.g. "?" or "Bg4". */
  marks?: Partial<Record<Square, string>>;
  showLabels?: boolean;
  onTap?: (sq: Square) => void;
  tone?: BoardTone;
  className?: string;
  label?: string;
}

// Filled glyphs for both colours (tinted by CSS); U+FE0E keeps iOS from drawing emoji.
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAME: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

export function resolveHidden(spec: HiddenSpec | undefined, sq: Square, piece: Piece): HiddenMode {
  if (!spec) return 'show';
  return (typeof spec === 'function' ? spec(sq, piece) : spec[sq]) ?? 'show';
}

export function Board({
  fen,
  orientation = 'white',
  hidden,
  highlights,
  marks,
  showLabels = true,
  onTap,
  tone = 'standard',
  className,
  label = 'Chess board',
}: BoardProps) {
  const pieces = useMemo(() => parsePlacement(fen), [fen]);
  const squares = useMemo(() => squaresInScreenOrder(orientation), [orientation]);

  return (
    <div
      className={['board', className].filter(Boolean).join(' ')}
      data-tone={tone}
      data-orientation={orientation}
      role="group"
      aria-label={label}
    >
      {squares.map((sq) => {
        const { row, col } = screenPos(sq, orientation);
        const piece = pieces.get(sq);
        const mode = piece ? resolveHidden(hidden, sq, piece) : undefined;
        const mark = marks?.[sq];
        const hl = highlights?.[sq];
        const light = isLightSquare(sq);
        const white = piece ? isWhitePiece(piece) : false;
        const showPiece = piece && mode === 'show' && !mark;

        const content = (
          <>
            {mark ? (
              <span className="board__mark">{mark}</span>
            ) : showPiece ? (
              <span className={`board__piece board__piece--${white ? 'w' : 'b'}`} aria-hidden="true">
                {GLYPH[piece.toLowerCase()]}
                {'︎'}
              </span>
            ) : null}
            {mode === 'ghost' && <span className="board__ghost" aria-hidden="true" />}
            {showLabels && col === 0 && (
              <span className="board__label board__label--rank" aria-hidden="true">
                {sq[1]}
              </span>
            )}
            {showLabels && row === 7 && (
              <span className="board__label board__label--file" aria-hidden="true">
                {sq[0]}
              </span>
            )}
          </>
        );

        const props = {
          className: `board__sq ${light ? 'is-light' : 'is-dark'}`,
          'data-square': sq,
          'data-hl': hl,
          'data-hidden': mode && mode !== 'show' ? mode : undefined,
        };

        if (!onTap) return <div key={sq} {...props}>{content}</div>;

        const desc = mark
          ? `${sq}, ${mark}`
          : showPiece
            ? `${sq}, ${white ? 'white' : 'black'} ${NAME[piece.toLowerCase()]}`
            : mode === 'ghost'
              ? `${sq}, hidden piece`
              : sq;
        return (
          <button key={sq} type="button" {...props} aria-label={desc} onClick={() => onTap(sq)}>
            {content}
          </button>
        );
      })}
    </div>
  );
}
