// The saved progress document and the pure updates applied to it.
// Persistence lives in store.ts.

import type { Orientation, Square } from '../board/squares';
import { LADDER, type LevelDef, type SessionSummary, passes } from '../levels/ladder';
import { emptyStats, recordAnswer, type StatsTable } from './stats';

export interface LevelRecord {
  attempts: number;
  passed: boolean;
  best: SessionSummary | null;
}

export interface Progress {
  version: 1;
  stats: StatsTable;
  levels: Record<string, LevelRecord>;
  streak: { days: number; lastDay: string | null };
  /** Longest run of correct answers in a row, ever. */
  bestRun: number;
}

export function emptyProgress(): Progress {
  return { version: 1, stats: emptyStats(), levels: {}, streak: { days: 0, lastDay: null }, bestRun: 0 };
}

/** Local-time YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y!, m! - 1, d! - 1));
}

export function isPassed(p: Progress, levelId: string): boolean {
  return p.levels[levelId]?.passed ?? false;
}

/** Index of the first level not yet passed; LADDER.length when all are passed. */
export function currentLevelIndex(p: Progress): number {
  const i = LADDER.findIndex((l) => !isPassed(p, l.id));
  return i === -1 ? LADDER.length : i;
}

export function isUnlocked(p: Progress, index: number): boolean {
  return index <= currentLevelIndex(p);
}

export function levelsPassed(p: Progress): number {
  return LADDER.filter((l) => isPassed(p, l.id)).length;
}

/** The streak as it should be shown today: a missed day resets it to 0. */
export function displayStreak(p: Progress, today: Date): number {
  const t = dayKey(today);
  const last = p.streak.lastDay;
  return last === t || last === previousDay(t) ? p.streak.days : 0;
}

export function withAnswer(
  p: Progress,
  orientation: Orientation,
  sq: Square,
  correct: boolean,
  ms: number,
  run: number,
): Progress {
  return { ...p, stats: recordAnswer(p.stats, orientation, sq, correct, ms), bestRun: Math.max(p.bestRun, run) };
}

function better(a: SessionSummary | null, b: SessionSummary): boolean {
  if (!a) return true;
  const ra = a.correct / a.total;
  const rb = b.correct / b.total;
  return rb > ra || (rb === ra && (b.medianMs ?? Infinity) < (a.medianMs ?? Infinity));
}

/** Apply a finished session: level record, pass state and day streak. */
export function withSession(p: Progress, level: LevelDef, summary: SessionSummary, now: Date): Progress {
  const prev = p.levels[level.id] ?? { attempts: 0, passed: false, best: null };
  const record: LevelRecord = {
    attempts: prev.attempts + 1,
    passed: prev.passed || passes(level, summary),
    best: better(prev.best, summary) ? summary : prev.best,
  };
  const t = dayKey(now);
  const last = p.streak.lastDay;
  const days = last === t ? p.streak.days : last === previousDay(t) ? p.streak.days + 1 : 1;
  return { ...p, levels: { ...p.levels, [level.id]: record }, streak: { days, lastDay: t } };
}
