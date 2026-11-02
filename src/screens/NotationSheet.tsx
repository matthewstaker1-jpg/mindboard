import { type ReactNode, useState } from 'react';
import type { LevelDef } from '../levels/ladder';
import { withPrefs } from '../progress/progress';
import { useProgress } from '../progress/store';
import { BackLink } from './game/parts';
import './NotationSheet.css';

interface Rule {
  example: string;
  means: string;
}

interface Card {
  title: string;
  intro: string;
  rules: Rule[];
  note?: string;
}

/** How a move is written (standard algebraic notation), in four short cards. */
export const NOTATION_CARDS: Card[] = [
  {
    title: 'Piece, then square',
    intro: 'Write the piece, then the square it lands on. Pawns have no letter.',
    rules: [
      { example: 'K Q R B N', means: 'King, queen, rook, bishop, knight. N, because K is the king.' },
      { example: 'Nf3', means: 'A knight goes to f3.' },
      { example: 'e4', means: 'A pawn goes to e4.' },
    ],
  },
  {
    title: 'Captures, check and mate',
    intro: 'An x means a capture. A pawn that captures starts with the file it came from.',
    rules: [
      { example: 'Bxe5', means: 'The bishop takes on e5.' },
      { example: 'exd5', means: 'The e-pawn takes on d5.' },
      { example: 'Qh5+', means: '+ at the end: check.' },
      { example: 'Qxf7#', means: '# at the end: checkmate.' },
    ],
  },
  {
    title: 'Castling and promotion',
    intro: 'Castling has its own sign. A pawn reaching the last rank adds = and the piece it becomes.',
    rules: [
      { example: 'O-O', means: 'Castle kingside (short). Capital O; 0-0 works here too.' },
      { example: 'O-O-O', means: 'Castle queenside (long).' },
      { example: 'e8=Q', means: 'The pawn reaches e8 and becomes a queen.' },
      { example: 'dxc8=N', means: 'The pawn takes on c8 and becomes a knight.' },
    ],
    note: 'A pawn can become a queen, rook, bishop or knight. The question tells you which.',
  },
  {
    title: 'When two pieces can go there',
    intro: 'If two of the same piece could reach the square, add where the moving one came from.',
    rules: [
      { example: 'Nbd2', means: 'The knight on the b-file goes to d2 (not the one on f3).' },
      { example: 'R1e2', means: 'Same file? Use the rank: the rook on rank 1 goes to e2.' },
    ],
  },
];

/**
 * The notation cheat sheet, one card at a time. With `onDone` it ends in
 * "I'm ready"; on its own page it ends with a link back.
 */
export function NotationSheet({ onDone }: { onDone?: () => void }) {
  const [i, setI] = useState(0);
  const card = NOTATION_CARDS[i]!;
  const last = i === NOTATION_CARDS.length - 1;

  return (
    <div className="app notation">
      <header className="game__top">
        <BackLink />
        <span className="game__title">NOTATION · {i + 1} OF {NOTATION_CARDS.length}</span>
        <span className="follow__spacer" />
      </header>

      {i === 0 && onDone && <p className="eyebrow">Before the notation levels</p>}
      <h1>{card.title}</h1>
      <p className="muted notation__intro">{card.intro}</p>

      <dl className="notation__rules">
        {card.rules.map((r) => (
          <Row key={r.example} example={r.example}>
            {r.means}
          </Row>
        ))}
      </dl>
      {card.note && <p className="muted notation__note">{card.note}</p>}

      <div className="notation__dots" aria-hidden="true">
        {NOTATION_CARDS.map((c, k) => (
          <span key={c.title} data-on={k === i || undefined} />
        ))}
      </div>

      <div className="notation__actions">
        {i > 0 && (
          <button type="button" className="btn" onClick={() => setI(i - 1)}>
            Back
          </button>
        )}
        {!last ? (
          <button type="button" className="btn btn--primary" onClick={() => setI(i + 1)} autoFocus>
            Next →
          </button>
        ) : onDone ? (
          <button type="button" className="btn btn--primary" onClick={onDone} autoFocus>
            I'm ready →
          </button>
        ) : (
          <a className="btn btn--primary" href="#/">
            Done
          </a>
        )}
      </div>
      {onDone && !last && (
        <button type="button" className="notation__skip" onClick={onDone}>
          Skip, I know this
        </button>
      )}
    </div>
  );
}

function Row({ example, children }: { example: string; children: ReactNode }) {
  return (
    <div className="notation__row">
      <dt className="mono">{example}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Shows the cheat sheet once, before your first notation (Stage 2) drill. */
export function NotationGate({ level, children }: { level: LevelDef; children: ReactNode }) {
  const { progress, update } = useProgress();
  if (!progress) return <div className="app" />;
  if (level.stage === 2 && !progress.prefs.notationSeen) {
    return <NotationSheet onDone={() => update((p) => withPrefs(p, { notationSeen: true }))} />;
  }
  return <>{children}</>;
}
