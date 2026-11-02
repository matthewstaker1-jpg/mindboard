// The saved progress document and the pure updates applied to it.
// Persistence lives in store.ts.

import type { Orientation, Square } from '../board/squares';
import { ALL_LEVELS } from '../levels/all';
import type { GameLevel } from '../levels/games';
import { type LevelDef, type SessionSummary, passes } from '../levels/ladder';
import { emptyStats, recordAnswer, type StatsTable } from './stats';

export interface LevelRecord {
  attempts: number;
  passed: boolean;
  best: SessionSummary | null;
  /** Game levels: passing games in a row right now, and results so far. */
  passRun?: number;
  games?: { win: number; draw: number; loss: number };
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

/** Index into ALL_LEVELS of the first level not yet passed; ALL_LEVELS.length when all are passed. */
export function currentLevelIndex(p: Progress): number {
  const i = ALL_LEVELS.findIndex((l) => !isPassed(p, l.id));
  return i === -1 ? ALL_LEVELS.length : i;
}

export function isUnlocked(p: Progress, index: number): boolean {
  return index <= currentLevelIndex(p);
}

export function levelsPassed(p: Progress): number {
  return ALL_LEVELS.filter((l) => isPassed(p, l.id)).length;
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

function withDay(p: Progress, now: Date): Progress['streak'] {
  const t = dayKey(now);
  const last = p.streak.lastDay;
  const days = last === t ? p.streak.days : last === previousDay(t) ? p.streak.days + 1 : 1;
  return { days, lastDay: t };
}

/** Apply a finished drill session: level record, pass state and day streak. */
export function withSession(p: Progress, level: LevelDef, summary: SessionSummary, now: Date): Progress {
  const prev = p.levels[level.id] ?? { attempts: 0, passed: false, best: null };
  const record: LevelRecord = {
    ...prev,
    attempts: prev.attempts + 1,
    passed: prev.passed || passes(level, summary),
    best: better(prev.best, summary) ? summary : prev.best,
  };
  return { ...p, levels: { ...p.levels, [level.id]: record }, streak: withDay(p, now) };
}

/**
 * Apply a finished game. A game level is passed after `gamesInARow`
 * passing games in a row (BUILD_PLAN: "pass three games in a row").
 */
export function withGame(
  p: Progress,
  level: GameLevel,
  outcome: 'win' | 'draw' | 'loss',
  passedGame: boolean,
  now: Date,
): Progress {
  const prev = p.levels[level.id] ?? { attempts: 0, passed: false, best: null };
  const games = { win: 0, draw: 0, loss: 0, ...prev.games };
  games[outcome]++;
  const passRun = passedGame ? (prev.passRun ?? 0) + 1 : 0;
  const record: LevelRecord = {
    ...prev,
    attempts: prev.attempts + 1,
    games,
    passRun,
    passed: prev.passed || passRun >= level.pass.gamesInARow,
  };
  return { ...p, levels: { ...p.levels, [level.id]: record }, streak: withDay(p, now) };
}
