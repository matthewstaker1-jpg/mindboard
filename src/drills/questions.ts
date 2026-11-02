// Question generators and answer checking for the five drill kinds.
// Pure: given a level, the stats table and an RNG, produce a question.

import { ALL_SQUARES, type Orientation, type Square } from '../board/squares';
import {
  type BankMove,
  PIECE_NAME,
  attackedEnemies,
  moveBank,
  pieceLabel,
  unattackedEnemies,
} from '../chess/game';
import { knightMidpoints, knightTargets, sanMatches } from '../chess/notation';
import type { DrillKind, LevelDef, MoveFilter } from '../levels/ladder';
import type { StatsTable } from '../progress/stats';
import { type Rng, pickAdaptive } from './queue';

export interface Bonus {
  prompt: string;
  options: string[];
  answer: string;
}

interface Base {
  id: number;
  orientation: Orientation;
  labels: boolean;
  targetMs: number;
  /** The square this question's result is filed under in the stats table. */
  statSquare: Square;
}

export type Question = Base &
  (
    | { kind: 'nameSquare'; square: Square }
    | { kind: 'tapSquare'; square: Square }
    | { kind: 'writeMove'; move: BankMove }
    | { kind: 'readMove'; move: BankMove; bonus: Bonus | null }
    | { kind: 'knightPath'; from: Square; to: Square; mids: Square[] }
  );

export interface GenContext {
  level: LevelDef;
  stats: StatsTable;
  /** Stat squares of the most recent questions, oldest first. */
  recent: Square[];
  rng: Rng;
}

let nextId = 1;

function pickOne<T>(xs: readonly T[], rng: Rng): T {
  return xs[Math.floor(rng() * xs.length)]!;
}

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function sideFor(level: LevelDef, rng: Rng): Orientation {
  return level.side === 'mixed' ? (rng() < 0.5 ? 'white' : 'black') : level.side;
}

export function moveMatchesFilter(m: BankMove, f: MoveFilter): boolean {
  switch (f) {
    case 'quiet':
      return !m.isCapture && !m.isCheck && !m.isCastle && !m.isPromotion;
    case 'captureCheck':
      return m.isCapture || m.isCheck;
    case 'special':
      return m.isCastle || m.isPromotion;
    case 'any':
      return !m.isPromotion;
  }
}

function pickMove(ctx: GenContext, orientation: Orientation): BankMove {
  const filter = ctx.level.moves ?? 'any';
  const color = orientation === 'white' ? 'w' : 'b';
  let pool = moveBank().filter((m) => m.color === color && moveMatchesFilter(m, filter));
  // Not every filter has moves for both colours in every bank; fall back to either colour.
  if (pool.length === 0) pool = moveBank().filter((m) => moveMatchesFilter(m, filter));
  return pickAdaptive(pool, (m) => m.to, ctx.stats, orientation, ctx.recent, ctx.rng);
}

/** "Which piece does your bishop attack now?" with exactly one right option. */
export function makeBonus(move: BankMove, rng: Rng): Bonus | null {
  if (move.isCastle) return null;
  const name = PIECE_NAME[move.promotion ?? move.piece]!;
  const hit = attackedEnemies(move.fenAfter, move.to);
  const miss = shuffle(unattackedEnemies(move.fenAfter, move.to), rng);
  const target = hit.length ? pickOne(hit, rng) : null;
  const right = target ? pieceLabel(target.piece, target.square) : 'Nothing';
  const wrong = miss.slice(0, 3).map((m) => pieceLabel(m.piece, m.square));
  if (target && wrong.length < 3) wrong.push('Nothing');
  if (wrong.length === 0) return null;
  return {
    prompt: `Bonus: what does your ${name} attack now?`,
    options: shuffle([right, ...wrong.slice(0, 3)], rng),
    answer: right,
  };
}

function knightQuestion(ctx: GenContext, orientation: Orientation) {
  const to = pickAdaptive([...ALL_SQUARES], (s) => s, ctx.stats, orientation, ctx.recent, ctx.rng);
  // Starting squares exactly two knight hops away (not one, not the same square).
  const oneHop = new Set(knightTargets(to));
  const starts = ALL_SQUARES.filter((s) => s !== to && !oneHop.has(s) && knightMidpoints(s, to).length > 0);
  const from = pickOne(starts, ctx.rng);
  return { from, to, mids: knightMidpoints(from, to) };
}

export function generateQuestion(ctx: GenContext, kind?: DrillKind): Question {
  const { level, rng } = ctx;
  const k = kind ?? pickOne(level.drills, rng);
  const orientation = sideFor(level, rng);
  const base = { id: nextId++, orientation, labels: level.labels, targetMs: level.targetMs };

  switch (k) {
    case 'nameSquare':
    case 'tapSquare': {
      const square = pickAdaptive([...ALL_SQUARES], (s) => s, ctx.stats, orientation, ctx.recent, rng);
      return { ...base, kind: k, square, statSquare: square };
    }
    case 'writeMove': {
      const move = pickMove(ctx, orientation);
      const o: Orientation = move.color === 'w' ? 'white' : 'black';
      return { ...base, orientation: o, kind: 'writeMove', move, statSquare: move.to };
    }
    case 'readMove': {
      const move = pickMove(ctx, orientation);
      const o: Orientation = move.color === 'w' ? 'white' : 'black';
      return { ...base, orientation: o, kind: 'readMove', move, bonus: makeBonus(move, rng), statSquare: move.to };
    }
    case 'knightPath': {
      const kq = knightQuestion(ctx, orientation);
      return { ...base, kind: 'knightPath', ...kq, statSquare: kq.to };
    }
  }
}

/** Same question, fresh id — used when a missed question comes back. */
export function repeatQuestion(q: Question): Question {
  return { ...q, id: nextId++ };
}

/**
 * Check an answer. Square drills take a square name ("f6"); write-move takes
 * the typed SAN; read-move takes the tapped landing square; knight paths take
 * the in-between square.
 */
export function checkAnswer(q: Question, given: string): boolean {
  const g = given.trim();
  switch (q.kind) {
    case 'nameSquare':
    case 'tapSquare':
      return g.toLowerCase() === q.square;
    case 'writeMove':
      return sanMatches(g, q.move.san);
    case 'readMove':
      return g.toLowerCase() === q.move.to;
    case 'knightPath':
      return q.mids.includes(g.toLowerCase() as Square);
  }
}

/** The answer shown after a miss. */
export function expectedAnswer(q: Question): string {
  switch (q.kind) {
    case 'nameSquare':
    case 'tapSquare':
      return q.square;
    case 'writeMove':
      return q.move.san;
    case 'readMove':
      return q.move.to;
    case 'knightPath':
      return q.mids.join(' or ');
  }
}
