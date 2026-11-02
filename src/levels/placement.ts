// Placement test: two short drills that let someone who already knows the
// board skip Stages 1–2 instead of grinding through 13 levels.

import type { SessionSummary } from './ladder';
import type { LevelDef } from './ladder';

export const PLACEMENT_SQUARES: LevelDef = {
  id: 'placement-squares',
  stage: 1,
  title: 'Placement · squares',
  blurb: 'Name and find squares, both sides, no labels.',
  drills: ['nameSquare', 'tapSquare'],
  side: 'mixed',
  labels: false,
  questions: 16,
  targetMs: 3000,
  pass: { minAccuracy: 0.85 },
};

export const PLACEMENT_MOVES: LevelDef = {
  id: 'placement-moves',
  stage: 2,
  title: 'Placement · moves',
  blurb: 'Write and read moves, captures, castling and knight paths.',
  drills: ['writeMove', 'readMove', 'knightPath'],
  side: 'mixed',
  labels: false,
  questions: 12,
  targetMs: 5000,
  moves: 'any',
  pass: { minAccuracy: 0.8 },
};

const SQUARE_LEVELS = ['name-white', 'tap-white', 'name-black', 'tap-black', 'name-nolabels', 'tap-nolabels'];
const MOVE_LEVELS = ['write-quiet', 'write-captures', 'read-move', 'write-special', 'knight-paths', 'mixed-review'];
/** Fast enough on the squares part to skip "Against the clock" too. */
export const PLACEMENT_FAST_MS = 2000;

/** Which ladder levels a placement result lets you skip. */
export function placementSkips(squares: SessionSummary, moves: SessionSummary | null): string[] {
  const acc = (s: SessionSummary) => (s.total ? s.correct / s.total : 0);
  if (acc(squares) < PLACEMENT_SQUARES.pass.minAccuracy) return [];
  const fast = squares.medianMs !== null && squares.medianMs <= PLACEMENT_FAST_MS;
  const out = [...SQUARE_LEVELS];
  if (fast) out.push('timed');
  // Stage 2 only opens if Stage 1 is fully skipped (the clock level included).
  if (fast && moves && acc(moves) >= PLACEMENT_MOVES.pass.minAccuracy) out.push(...MOVE_LEVELS);
  return out;
}
