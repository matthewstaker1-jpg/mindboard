// The level ladder for Stages 1–2. Data, not code: screens and drills read
// these objects; adding a level means adding an entry here.

export type DrillKind = 'nameSquare' | 'tapSquare' | 'writeMove' | 'readMove' | 'knightPath';
export type SideSetting = 'white' | 'black' | 'mixed';
export type MoveFilter = 'quiet' | 'captureCheck' | 'special' | 'any';

export interface LevelDef {
  id: string;
  stage: 1 | 2;
  title: string;
  blurb: string;
  /** One kind, or several to mix. */
  drills: DrillKind[];
  /** Which side of the board you sit on. For move drills this is the side to move. */
  side: SideSetting;
  labels: boolean;
  questions: number;
  /** Shown as the per-answer target; also gates passing when `pass.maxMedianMs` is set. */
  targetMs: number;
  moves?: MoveFilter;
  pass: { minAccuracy: number; maxMedianMs?: number };
}

export const STAGE_NAMES: Record<number, string> = {
  1: 'Learn the board',
  2: 'Moves & notation',
};

export const LADDER: LevelDef[] = [
  {
    id: 'name-white',
    stage: 1,
    title: 'Name the square',
    blurb: 'One square lights up. Say which it is.',
    drills: ['nameSquare'],
    side: 'white',
    labels: true,
    questions: 20,
    targetMs: 3000,
    pass: { minAccuracy: 0.9 },
  },
  {
    id: 'tap-white',
    stage: 1,
    title: 'Find the square',
    blurb: 'You get a name. Tap the square.',
    drills: ['tapSquare'],
    side: 'white',
    labels: true,
    questions: 20,
    targetMs: 3000,
    pass: { minAccuracy: 0.9 },
  },
  {
    id: 'name-black',
    stage: 1,
    title: 'Name it as Black',
    blurb: "Same game from Black's chair. Files run h → a.",
    drills: ['nameSquare'],
    side: 'black',
    labels: true,
    questions: 20,
    targetMs: 3000,
    pass: { minAccuracy: 0.9 },
  },
  {
    id: 'tap-black',
    stage: 1,
    title: 'Find it as Black',
    blurb: "Tap the square from Black's side of the board.",
    drills: ['tapSquare'],
    side: 'black',
    labels: true,
    questions: 20,
    targetMs: 3000,
    pass: { minAccuracy: 0.9 },
  },
  {
    id: 'name-nolabels',
    stage: 1,
    title: 'Labels off: name',
    blurb: 'No coordinates on the board, either side.',
    drills: ['nameSquare'],
    side: 'mixed',
    labels: false,
    questions: 20,
    targetMs: 3000,
    pass: { minAccuracy: 0.9 },
  },
  {
    id: 'tap-nolabels',
    stage: 1,
    title: 'Labels off: find',
    blurb: 'Tap the square with no coordinates to lean on.',
    drills: ['tapSquare'],
    side: 'mixed',
    labels: false,
    questions: 20,
    targetMs: 3000,
    pass: { minAccuracy: 0.9 },
  },
  {
    id: 'timed',
    stage: 1,
    title: 'Against the clock',
    blurb: 'Name and find, both sides, labels off. Median under 2 seconds.',
    drills: ['nameSquare', 'tapSquare'],
    side: 'mixed',
    labels: false,
    questions: 20,
    targetMs: 2000,
    pass: { minAccuracy: 0.9, maxMedianMs: 2000 },
  },
  {
    id: 'write-quiet',
    stage: 2,
    title: 'Write the move',
    blurb: 'A piece moves from the green square to the lime one. Write it down.',
    drills: ['writeMove'],
    side: 'white',
    labels: true,
    questions: 15,
    targetMs: 5000,
    moves: 'quiet',
    pass: { minAccuracy: 0.85 },
  },
  {
    id: 'write-captures',
    stage: 2,
    title: 'Captures & checks',
    blurb: 'Takes need an x. Both colours now.',
    drills: ['writeMove'],
    side: 'mixed',
    labels: true,
    questions: 15,
    targetMs: 5000,
    moves: 'captureCheck',
    pass: { minAccuracy: 0.85 },
  },
  {
    id: 'read-move',
    stage: 2,
    title: 'Read the move',
    blurb: 'You get the move. Drag the piece from where it stands to where it lands.',
    drills: ['readMove'],
    side: 'mixed',
    labels: true,
    questions: 15,
    targetMs: 3000,
    moves: 'any',
    pass: { minAccuracy: 0.85 },
  },
  {
    id: 'write-special',
    stage: 2,
    title: 'Castling & promotion',
    blurb: 'O-O, O-O-O and e8=Q.',
    drills: ['writeMove'],
    side: 'mixed',
    labels: true,
    questions: 12,
    targetMs: 5000,
    moves: 'special',
    pass: { minAccuracy: 0.85 },
  },
  {
    id: 'knight-paths',
    stage: 2,
    title: 'Knight paths',
    blurb: 'Two hops to the lime square. Move the knight to a square in between.',
    drills: ['knightPath'],
    side: 'mixed',
    labels: true,
    questions: 15,
    targetMs: 5000,
    pass: { minAccuracy: 0.85 },
  },
  {
    id: 'mixed-review',
    stage: 2,
    title: 'Mixed review',
    blurb: 'Everything so far, both colours, labels off.',
    drills: ['nameSquare', 'tapSquare', 'writeMove', 'readMove', 'knightPath'],
    side: 'mixed',
    labels: false,
    questions: 20,
    targetMs: 4000,
    moves: 'any',
    pass: { minAccuracy: 0.85 },
  },
];

export function levelById(id: string): LevelDef | undefined {
  return LADDER.find((l) => l.id === id);
}


export interface SessionSummary {
  correct: number;
  total: number;
  medianMs: number | null;
}

export function passes(level: LevelDef, s: SessionSummary): boolean {
  if (s.total < level.questions) return false;
  if (s.correct / s.total < level.pass.minAccuracy) return false;
  if (level.pass.maxMedianMs != null && (s.medianMs == null || s.medianMs > level.pass.maxMedianMs)) return false;
  return true;
}

/** How far under the pass mark you can be and still move on: 15/20 on a 90% level, 70% on an 85% one. */
export const MOVE_ON_MARGIN = 0.15;

/** A near miss: not passed, but close enough to go on and come back to this level later. Speed doesn't count. */
export function canMoveOn(level: LevelDef, s: SessionSummary): boolean {
  if (s.total < level.questions || passes(level, s)) return false;
  return s.correct / s.total >= level.pass.minAccuracy - MOVE_ON_MARGIN - 1e-9;
}

/**
 * Today's warm-up: a short mixed square drill (not part of the ladder). Levels
 * you moved on from add their drill kinds and two questions each, so they come
 * back a few at a time.
 */
export function warmupLevel(labels: boolean, comeBack: LevelDef[] = []): LevelDef {
  const drills = [...new Set<DrillKind>(['nameSquare', 'tapSquare', ...comeBack.flatMap((l) => l.drills)])];
  const questions = Math.min(20, 10 + 2 * comeBack.length);
  return {
    id: 'warmup',
    stage: 1,
    title: 'Warm-up',
    blurb: comeBack.length ? `Quick squares, plus ${comeBack.map((l) => l.title).join(', ')}.` : 'Ten quick squares, both sides.',
    drills,
    side: 'mixed',
    labels,
    questions,
    targetMs: 3000,
    pass: { minAccuracy: 0.8 },
  };
}
