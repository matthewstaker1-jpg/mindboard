// Adaptive choice of what to ask next: weak and slow squares come up more
// often, never-seen squares get a nudge, and very recent squares are avoided.
// Missed questions are re-queued 3–5 questions later (see session.ts).

import { type Orientation, type Square } from '../board/squares';
import { type StatsTable, weakness } from '../progress/stats';

export type Rng = () => number;

export const RETRY_MIN_GAP = 3;
export const RETRY_MAX_GAP = 5;
/** Squares due for review (missed on an earlier day) are this many times likelier to come up. */
export const DUE_BOOST = 4;

export function squareWeight(table: StatsTable, orientation: Orientation, sq: Square): number {
  const st = table[orientation][sq];
  if (!st || st.seen === 0) return 1.5;
  return 0.5 + weakness(st) * 2;
}

/** Pick one item by weight. `items` must be non-empty. */
export function weightedPick<T>(items: T[], weight: (t: T) => number, rng: Rng): T {
  const ws = items.map((t) => Math.max(0, weight(t)));
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)]!;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/**
 * Pick from `candidates`, weighting by the weakness of `squareOf(c)` and
 * skipping anything whose square was asked in the last few questions.
 */
export function pickAdaptive<T>(
  candidates: T[],
  squareOf: (c: T) => Square,
  table: StatsTable,
  orientation: Orientation,
  recent: Square[],
  rng: Rng,
  due?: ReadonlySet<string>,
): T {
  const avoid = new Set(recent.slice(-4));
  const pool = candidates.filter((c) => !avoid.has(squareOf(c)));
  const weight = (c: T) => {
    const sq = squareOf(c);
    return squareWeight(table, orientation, sq) * (due?.has(`${orientation}:${sq}`) ? DUE_BOOST : 1);
  };
  return weightedPick(pool.length ? pool : candidates, weight, rng);
}

/** How many questions from now a missed question comes back. */
export function retryGap(rng: Rng): number {
  return RETRY_MIN_GAP + Math.floor(rng() * (RETRY_MAX_GAP - RETRY_MIN_GAP + 1));
}
