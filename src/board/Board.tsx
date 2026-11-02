import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  type Orientation,
  type Piece,
  type Square,
  isLightSquare,
  isWhitePiece,
  parsePlacement,
  screenPos,
  squareFromPoint,
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
  /**
   * Turns on moving pieces like chess.com: drag a piece to a square, or click
   * it and then click the square. Any target is reported; legality is the
   * caller's business.
   */
  onMove?: (from: Square, to: Square) => void;
  /** Which visible pieces may be picked up (default: all). Only used with onMove. */
  canDrag?: (sq: Square, piece: Piece) => boolean;
  tone?: BoardTone;
  className?: string;
  label?: string;
}

// Filled glyphs for both colours (tinted by CSS); U+FE0E keeps iOS from drawing emoji.
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAME: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

/** Pixels the pointer must travel before a press counts as a drag rather than a click. */
const DRAG_SLOP = 4;

export function resolveHidden(spec: HiddenSpec | undefined, sq: Square, piece: Piece): HiddenMode {
  if (!spec) return 'show';
  return (typeof spec === 'function' ? spec(sq, piece) : spec[sq]) ?? 'show';
}

interface DragState {
  from: Square;
  piece: Piece;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  over: Square | null;
}

function Glyph({ piece, className = '' }: { piece: Piece; className?: string }) {
  return (
    <span className={`board__piece board__piece--${isWhitePiece(piece) ? 'w' : 'b'} ${className}`} aria-hidden="true">
      {GLYPH[piece.toLowerCase()]}
      {'︎'}
    </span>
  );
}

export function Board({
  fen,
  orientation = 'white',
  hidden,
  highlights,
  marks,
  showLabels = true,
  onTap,
  onMove,
  canDrag,
  tone = 'standard',
  className,
  label = 'Chess board',
}: BoardProps) {
  const pieces = useMemo(() => parsePlacement(fen), [fen]);
  const squares = useMemo(() => squaresInScreenOrder(orientation), [orientation]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedRaw, setSelected] = useState<{ sq: Square; fen: string } | null>(null);
  // A selection only survives while the position is unchanged and moving is on.
  const selected = onMove && selectedRaw?.fen === fen ? selectedRaw.sq : null;

  const movable = (sq: Square): Piece | null => {
    const p = pieces.get(sq);
    if (!p || !onMove || marks?.[sq] || resolveHidden(hidden, sq, p) !== 'show') return null;
    return !canDrag || canDrag(sq, p) ? p : null;
  };

  const local = (e: ReactPointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return { x, y, sq: squareFromPoint(x, y, r.width, orientation) };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onMove || e.button !== 0) return;
    const { x, y, sq } = local(e);
    if (!sq) return;
    const piece = movable(sq);
    const held = selected ? pieces.get(selected) : undefined;
    // With a piece already picked up, clicking anything but one of its own side is the move.
    if (held && sq !== selected && !(piece && isWhitePiece(piece) === isWhitePiece(held))) {
      setSelected(null);
      onMove(selected!, sq);
    } else if (piece) {
      e.preventDefault();
      rootRef.current!.setPointerCapture?.(e.pointerId);
      setDrag({ from: sq, piece, startX: x, startY: y, x, y, moved: false, over: sq });
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const { x, y, sq } = local(e);
    const moved = drag.moved || Math.hypot(x - drag.startX, y - drag.startY) > DRAG_SLOP;
    setDrag({ ...drag, x, y, moved, over: sq });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || !onMove) return;
    const { sq } = local(e);
    setDrag(null);
    if (!drag.moved || sq === drag.from) {
      // A click: pick the piece up (or put it back down if it was already up).
      setSelected(selected === drag.from ? null : { sq: drag.from, fen });
      return;
    }
    setSelected(null);
    if (sq) onMove(drag.from, sq);
  };

  const dragging = drag?.moved ? drag : null;

  return (
    <div
      ref={rootRef}
      className={['board', className].filter(Boolean).join(' ')}
      data-tone={tone}
      data-orientation={orientation}
      data-movable={onMove ? '' : undefined}
      data-dragging={dragging ? '' : undefined}
      role="group"
      aria-label={label}
      onPointerDown={onMove ? onPointerDown : undefined}
      onPointerMove={onMove ? onPointerMove : undefined}
      onPointerUp={onMove ? onPointerUp : undefined}
      onPointerCancel={onMove ? () => setDrag(null) : undefined}
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
              <Glyph piece={piece} />
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
          'data-can-drag': onMove && movable(sq) ? '' : undefined,
          'data-selected': selected === sq ? '' : undefined,
          'data-lifted': dragging?.from === sq ? '' : undefined,
          'data-over': dragging && dragging.over === sq && sq !== dragging.from ? '' : undefined,
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
      {dragging && (
        <span className="board__float" style={{ left: dragging.x, top: dragging.y }}>
          <Glyph piece={dragging.piece} />
        </span>
      )}
    </div>
  );
}
