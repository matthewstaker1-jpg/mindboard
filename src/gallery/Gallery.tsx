import { useState } from 'react';
import { Board, type BoardProps } from '../board/Board';
import { EMPTY_FEN, isWhitePiece, type Square } from '../board/squares';
import './Gallery.css';

// Italian Game after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6
const ITALIAN_4_NF6 = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R b KQkq - 1 4';
const LAST_MOVE_NF6 = { g8: 'from', f6: 'from' } as const;

interface Case {
  id: string;
  title: string;
  note: string;
  props: BoardProps;
}

const CASES: Case[] = [
  {
    id: 'name-square',
    title: 'Name the square',
    note: 'Empty board, f6 lit as the target and marked "?"',
    props: { fen: EMPTY_FEN, highlights: { f6: 'target' }, marks: { f6: '?' } },
  },
  {
    id: 'as-black',
    title: 'Find it as Black',
    note: "Black's view, labels off. b6 warn (×), g3 target",
    props: {
      fen: EMPTY_FEN,
      orientation: 'black',
      showLabels: false,
      highlights: { b6: 'warn', g3: 'target' },
      marks: { b6: '×', g3: 'g3' },
    },
  },
  {
    id: 'fog',
    title: 'Fog: pieces fade',
    note: 'Italian after 4…Nf6. c4, f3, d1, a1 ghosted',
    props: {
      fen: ITALIAN_4_NF6,
      highlights: LAST_MOVE_NF6,
      hidden: { c4: 'ghost', f3: 'ghost', d1: 'ghost', a1: 'ghost' },
    },
  },
  {
    id: 'ghost-army',
    title: 'Ghost army',
    note: 'Same position, every white piece gone',
    props: {
      fen: ITALIAN_4_NF6,
      highlights: LAST_MOVE_NF6,
      hidden: (_sq, piece) => (isWhitePiece(piece) ? 'gone' : 'show'),
    },
  },
  {
    id: 'dark',
    title: 'Dark board: last move only',
    note: 'Empty dark board, c8 → g4 lit',
    props: { fen: EMPTY_FEN, tone: 'dark', highlights: { c8: 'from', g4: 'target' }, marks: { g4: 'Bg4' } },
  },
];

function GalleryCard({ c }: { c: Case }) {
  const [tapped, setTapped] = useState<Square | null>(null);
  return (
    <section className="gallery__card" aria-labelledby={`${c.id}-title`}>
      <header className="gallery__head">
        <h2 id={`${c.id}-title`}>{c.title}</h2>
        <p>{c.note}</p>
      </header>
      <Board {...c.props} label={c.title} onTap={setTapped} />
      <footer className="gallery__foot">
        <span>Tapped</span>
        <span className="gallery__tap">{tapped ?? '—'}</span>
      </footer>
    </section>
  );
}

export function Gallery() {
  return (
    <main className="gallery">
      <header className="gallery__top">
        <div className="gallery__brand">Mindboard</div>
        <h1>Board gallery</h1>
        <p>Phase 0: the canvas boards rebuilt with the shared Board component. Tap any square.</p>
      </header>
      <div className="gallery__grid">
        {CASES.map((c) => (
          <GalleryCard key={c.id} c={c} />
        ))}
      </div>
    </main>
  );
}
