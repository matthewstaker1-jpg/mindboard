// Per-square accuracy and speed, kept separately for each orientation
// (the 64×2 table from BUILD_PLAN.md). Pure functions only.

import { ALL_SQUARES, type Orientation, type Square } from '../board/squares';

export interface SquareStat {
  seen: number;
  correct: number;
  /** Response times (ms) of the most recent answers, newest last. */
  times: number[];
}

export type StatsTable = Record<Orientation, Record<Square, SquareStat>>;

const KEEP_TIMES = 10;
/** Squares need this many answers before they can count as "weakest". */
export const MIN_SEEN_FOR_WEAK = 2;

export function emptyStat(): SquareStat {
  return { seen: 0, correct: 0, times: [] };
}

export function emptyStats(): StatsTable {
  const side = () => Object.fromEntries(ALL_SQUARES.map((s) => [s, emptyStat()])) as Record<Square, SquareStat>;
  return { white: side(), black: side() };
}

export function recordAnswer(
  table: StatsTable,
  orientation: Orientation,
  sq: Square,
  correct: boolean,
  ms: number,
): StatsTable {
  const prev = table[orientation][sq] ?? emptyStat();
  const next: SquareStat = {
    seen: prev.seen + 1,
    correct: prev.correct + (correct ? 1 : 0),
    times: [...prev.times, Math.round(ms)].slice(-KEEP_TIMES),
  };
  return { ...table, [orientation]: { ...table[orientation], [sq]: next } };
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function accuracy(stat: SquareStat): number | null {
  return stat.seen === 0 ? null : stat.correct / stat.seen;
}

/**
 * How weak a square is: 0 is solid, higher is weaker. Misses dominate;
 * slowness beyond `targetMs` adds up to 1 more.
 */
export function weakness(stat: SquareStat, targetMs = 3000): number {
  if (stat.seen === 0) return 0;
  // Laplace-smoothed miss rate so one lucky answer doesn't read as mastery.
  const missRate = (stat.seen - stat.correct + 0.5) / (stat.seen + 1);
  const med = median(stat.times) ?? targetMs;
  const slow = Math.min(1, Math.max(0, (med - targetMs) / targetMs));
  return missRate * 2 + slow;
}

export interface WeakSquare {
  square: Square;
  orientation: Orientation;
  accuracy: number;
  medianMs: number | null;
  seen: number;
  score: number;
}

/** The weakest squares that have been seen enough, worst first. */
export function weakestSquares(table: StatsTable, orientation: Orientation | 'both', limit = 5): WeakSquare[] {
  const sides: Orientation[] = orientation === 'both' ? ['white', 'black'] : [orientation];
  const all: WeakSquare[] = [];
  for (const o of sides) {
    for (const sq of ALL_SQUARES) {
      const st = table[o][sq];
      if (!st || st.seen < MIN_SEEN_FOR_WEAK) continue;
      all.push({
        square: sq,
        orientation: o,
        accuracy: st.correct / st.seen,
        medianMs: median(st.times),
        seen: st.seen,
        score: weakness(st),
      });
    }
  }
  return all
    .filter((w) => w.accuracy < 1 || (w.medianMs ?? 0) > 3000)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
