// Training content built from Lichess's public-domain data by
// scripts/build-content.ts. Loaded lazily (it's a few hundred KB), with the
// small hand-written sets as a fallback until it arrives.

import type { Goal } from '../game/fogGame';

export interface ContentLine {
  name: string;
  moves: string[];
}

export interface ContentPosition {
  id: string;
  title: string;
  fen: string;
  goal?: Goal;
  rating?: number;
}

export interface Content {
  /** Named opening lines and the first 30 plies of real 1800+ games. */
  lines: ContentLine[];
  /** Quiet, level positions from moves 9–13 of real games. */
  middlegames: ContentPosition[];
  /** Mate-in-2/3 and pawn-ending puzzles from real games. */
  puzzles: ContentPosition[];
}

let loaded: Content | null = null;
let loading: Promise<Content> | null = null;

export function loadContent(): Promise<Content> {
  loading ??= Promise.all([import('./lines.json'), import('./middlegames.json'), import('./puzzles.json')]).then(
    ([l, m, p]) => {
      loaded = { lines: l.default as ContentLine[], middlegames: m.default as ContentPosition[], puzzles: p.default as ContentPosition[] };
      return loaded;
    },
  );
  return loading;
}

/** The content if it has loaded, else null. */
export function content(): Content | null {
  return loaded;
}
