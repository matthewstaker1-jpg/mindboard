// The saved progress document and the pure updates applied to it.
// Persistence lives in store.ts.

import type { Orientation, Square } from '../board/squares';
import { strengthFor } from '../engine/engine';
import { ALL_LEVELS } from '../levels/all';
import type { GameLevel } from '../levels/games';
import { type LevelDef, type SessionSummary, passes } from '../levels/ladder';
import { emptyStats, recordAnswer, type StatsTable } from './stats';

export interface LevelRecord {
  attempts: number;
  passed: boolean;
  best: SessionSummary | null;
  /** Game levels: whether each of the most recent games counted, newest last. */
  recent?: boolean[];
  /** Drill levels: you went on after a near miss; the level waits to be passed properly. */
  movedOn?: boolean;
  games?: { win: number; draw: number; loss: number };
}

export type StudyKind = 'middlegame' | 'endgame' | 'mate' | 'any';
export type StudyHide = 'moved' | 'own-all' | 'all';

/** Your settings. They live in the same saved document as progress so export/import carries them. */
export interface Prefs {
  /** Show letters and numbers on boards that allow them. */
  coords: boolean;
  voice: boolean;
  /** Prompts and engine moves are spoken, not written. */
  earsOnly: boolean;
  /** Games pause now and then to ask where a hidden piece is. */
  recallChecks: boolean;
  study: { kind: StudyKind; hide: StudyHide };
  follow: { pace: number; aloud: boolean };
  /** The first-run walkthrough has been seen. */
  onboarded: boolean;
}

/** Spaced repetition for squares you miss: when each should come back. */
export interface ReviewCard {
  /** YYYY-MM-DD it's next due. */
  due: string;
  /** Days until the next review after a correct answer. */
  interval: number;
}

/** Lost-track slips per square (kept apart from naming accuracy). */
export type LostTrackTable = Record<Orientation, Partial<Record<Square, number>>>;

export const PROGRESS_VERSION = 2;

export interface Progress {
  version: typeof PROGRESS_VERSION;
  stats: StatsTable;
  lostTrack: LostTrackTable;
  levels: Record<string, LevelRecord>;
  streak: { days: number; lastDay: string | null };
  /** Longest run of correct answers in a row, ever. */
  bestRun: number;
  /**
   * Added to each game level's engine rating, per level. Moves up when you
   * win and down when you lose, so games settle near an even score.
   */
  engineOffsets: Record<string, number>;
  study: { played: number; passed: number };
  /** Follow the moves: how many plies the next round reads out. */
  follow: { plies: number; rounds: number; perfect: number };
  /** The last day (YYYY-MM-DD) the Today session was finished. */
  todayDone: string | null;
  /** Squares due for review on later days, keyed "white:e4". */
  review: Record<string, ReviewCard>;
  prefs: Prefs;
}

export function defaultPrefs(): Prefs {
  return {
    coords: true,
    voice: false,
    earsOnly: false,
    recallChecks: false,
    study: { kind: 'any', hide: 'own-all' },
    follow: { pace: 1, aloud: false },
    onboarded: false,
  };
}

export const ENGINE_STEP = 40;
export const ENGINE_OFFSET_LIMIT = 400;

/** The rating a level asks the engine for, after your results have adjusted it. */
export function effectiveElo(levelElo: number, offset: number): number {
  return Math.max(600, Math.min(2400, levelElo + offset));
}

/** What to show: the measured strength of the settings that target actually uses. */
export function shownElo(levelElo: number, offset: number): number {
  return strengthFor(effectiveElo(levelElo, offset)).measured;
}

export function emptyProgress(): Progress {
  return {
    version: PROGRESS_VERSION,
    stats: emptyStats(),
    lostTrack: { white: {}, black: {} },
    levels: {},
    streak: { days: 0, lastDay: null },
    bestRun: 0,
    engineOffsets: {},
    study: { played: 0, passed: 0 },
    follow: { plies: 6, rounds: 0, perfect: 0 },
    todayDone: null,
    review: {},
    prefs: defaultPrefs(),
  };
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

/** Moved on from after a near miss and not passed since. */
export function isMovedOn(p: Progress, levelId: string): boolean {
  const r = p.levels[levelId];
  return !!r?.movedOn && !r.passed;
}

/** Levels waiting for you to come back to, in ladder order. */
export function movedOnLevels(p: Progress): string[] {
  return ALL_LEVELS.filter((l) => isMovedOn(p, l.id)).map((l) => l.id);
}

/**
 * Index into ALL_LEVELS of the first level neither passed nor moved on from;
 * ALL_LEVELS.length when there's none left.
 */
export function currentLevelIndex(p: Progress): number {
  const i = ALL_LEVELS.findIndex((l) => !isPassed(p, l.id) && !isMovedOn(p, l.id));
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
  now: Date = new Date(),
): Progress {
  return {
    ...p,
    stats: recordAnswer(p.stats, orientation, sq, correct, ms),
    bestRun: Math.max(p.bestRun, run),
    review: reviewAfter(p.review, `${orientation}:${sq}`, correct, now),
  };
}

/** Longest gap between reviews; a square that survives it is considered learnt. */
export const REVIEW_MAX_DAYS = 30;

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y!, m! - 1, d! + n));
}

/**
 * Spaced repetition: a miss schedules the square for tomorrow; a right answer
 * on a due square pushes it further out (1 → 3 → 7 → 16 → 30 days), then
 * retires it. Right answers on squares that aren't due change nothing.
 */
export function reviewAfter(review: Progress['review'], key: string, correct: boolean, now: Date): Progress['review'] {
  const today = dayKey(now);
  const card = review[key];
  if (!correct) return { ...review, [key]: { due: addDays(today, 1), interval: 1 } };
  if (!card || card.due > today) return review;
  const interval = Math.round(card.interval * 2.3) || 1;
  if (interval > REVIEW_MAX_DAYS) {
    const { [key]: _done, ...rest } = review;
    return rest;
  }
  return { ...review, [key]: { due: addDays(today, interval), interval } };
}

/** Squares due for review today, as "white:e4" keys. */
export function dueSquares(p: Progress, now: Date): Set<string> {
  const today = dayKey(now);
  return new Set(Object.entries(p.review).filter(([, c]) => c.due <= today).map(([k]) => k));
}

/** A slip in a game: counted against the square where you lost track, not as a naming miss. */
export function withLostTrack(p: Progress, orientation: Orientation, sq: Square): Progress {
  const side = p.lostTrack[orientation];
  return { ...p, lostTrack: { ...p.lostTrack, [orientation]: { ...side, [sq]: (side[sq] ?? 0) + 1 } } };
}

/** Squares where you most often lose track of your pieces, worst first. */
export function lostTrackSquares(p: Progress, orientation: Orientation, limit = 5): { square: Square; count: number }[] {
  return Object.entries(p.lostTrack[orientation])
    .map(([square, count]) => ({ square: square as Square, count: count ?? 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
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

/** Go on to the next level after a near miss; this one stays to be passed later. */
export function withMovedOn(p: Progress, levelId: string): Progress {
  const prev = p.levels[levelId] ?? { attempts: 0, passed: false, best: null };
  return { ...p, levels: { ...p.levels, [levelId]: { ...prev, movedOn: true } } };
}

export function engineOffset(p: Progress, levelId: string): number {
  return p.engineOffsets[levelId] ?? 0;
}

/** Mark levels as passed after a placement test (records keep their attempts and best). */
export function withSkipped(p: Progress, levelIds: string[]): Progress {
  const levels = { ...p.levels };
  for (const id of levelIds) levels[id] = { ...(levels[id] ?? { attempts: 0, best: null }), passed: true };
  return { ...p, levels };
}

/** Nudge this level's engine towards an even score: up after a win, down after a loss. */
export function withEngineResult(p: Progress, levelId: string, outcome: 'win' | 'draw' | 'loss'): Progress {
  const step = outcome === 'win' ? ENGINE_STEP : outcome === 'loss' ? -ENGINE_STEP : 0;
  const next = Math.max(-ENGINE_OFFSET_LIMIT, Math.min(ENGINE_OFFSET_LIMIT, engineOffset(p, levelId) + step));
  return { ...p, engineOffsets: { ...p.engineOffsets, [levelId]: next } };
}

export function withPrefs(p: Progress, change: Partial<Prefs>): Progress {
  return { ...p, prefs: { ...p.prefs, ...change } };
}

export function withStudy(p: Progress, passed: boolean, now: Date): Progress {
  return {
    ...p,
    study: { played: p.study.played + 1, passed: p.study.passed + (passed ? 1 : 0) },
    streak: withDay(p, now),
  };
}

/** Follow the moves gets longer after a perfect round and shorter after a bad one. */
export function withFollowRound(p: Progress, correct: number, total: number, now: Date): Progress {
  const perfect = correct === total;
  const plies = perfect ? Math.min(30, p.follow.plies + 2) : correct <= total - 2 ? Math.max(4, p.follow.plies - 2) : p.follow.plies;
  return {
    ...p,
    follow: { plies, rounds: p.follow.rounds + 1, perfect: p.follow.perfect + (perfect ? 1 : 0) },
    streak: withDay(p, now),
  };
}

export function withTodayDone(p: Progress, now: Date): Progress {
  return { ...p, todayDone: dayKey(now), streak: withDay(p, now) };
}

/** How many of the most recent games counted, out of the window the level looks at. */
export function recentPasses(rec: LevelRecord | undefined, level: GameLevel): number {
  return (rec?.recent ?? []).slice(-level.pass.of).filter(Boolean).length;
}

/** Apply a finished game. A game level is passed once `need` of your last `of` games count. */
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
  const recent = [...(prev.recent ?? []), passedGame].slice(-level.pass.of);
  const record: LevelRecord = {
    ...prev,
    attempts: prev.attempts + 1,
    games,
    recent,
    passed: prev.passed || recent.filter(Boolean).length >= level.pass.need,
  };
  return withEngineResult({ ...p, levels: { ...p.levels, [level.id]: record }, streak: withDay(p, now) }, level.id, outcome);
}
