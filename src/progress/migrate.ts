// Turning whatever is in storage (or an imported file) into a valid Progress.
// Every field is checked; anything missing or the wrong shape falls back to
// its default rather than breaking the app. Old versions are upgraded step by
// step.

import { ALL_SQUARES, type Orientation, type Square } from '../board/squares';
import { type LevelRecord, type Progress, type ReviewCard, PROGRESS_VERSION, defaultPrefs, emptyProgress } from './progress';
import { type SquareStat, emptyStat, emptyStats, type StatsTable } from './stats';

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown): string | null => (typeof v === 'string' && DAY.test(v) ? v : null);
const ORIENTATIONS: Orientation[] = ['white', 'black'];
const isSquare = (s: string): s is Square => (ALL_SQUARES as readonly string[]).includes(s);

/** v1 → v2: one shared engine offset became one per level; prefs moved in from localStorage. */
function v1to2(raw: Raw, legacyPrefs: Raw): Raw {
  const { engineOffset: _dropped, ...rest } = raw;
  return { ...rest, version: 2, engineOffsets: {}, lostTrack: { white: {}, black: {} }, review: {}, prefs: legacyPrefs };
}

function cleanStat(v: unknown): SquareStat {
  if (!isObj(v)) return emptyStat();
  const seen = Math.max(0, Math.floor(num(v.seen, 0)));
  const correct = Math.min(seen, Math.max(0, Math.floor(num(v.correct, 0))));
  const times = Array.isArray(v.times) ? v.times.filter((t): t is number => typeof t === 'number' && t >= 0).slice(-10) : [];
  return { seen, correct, times };
}

function cleanStats(v: unknown): StatsTable {
  const out = emptyStats();
  if (!isObj(v)) return out;
  for (const o of ORIENTATIONS) {
    const side = v[o];
    if (!isObj(side)) continue;
    for (const sq of ALL_SQUARES) if (sq in side) out[o][sq] = cleanStat(side[sq]);
  }
  return out;
}

function cleanLevel(v: unknown): LevelRecord | null {
  if (!isObj(v)) return null;
  const best = isObj(v.best) && typeof v.best.correct === 'number' && typeof v.best.total === 'number'
    ? { correct: v.best.correct, total: v.best.total, medianMs: typeof v.best.medianMs === 'number' ? v.best.medianMs : null }
    : null;
  const rec: LevelRecord = { attempts: Math.max(0, num(v.attempts, 0)), passed: bool(v.passed, false), best };
  if (Array.isArray(v.recent)) rec.recent = v.recent.filter((x): x is boolean => typeof x === 'boolean').slice(-3);
  if (isObj(v.games)) rec.games = { win: num(v.games.win, 0), draw: num(v.games.draw, 0), loss: num(v.games.loss, 0) };
  return rec;
}

function cleanPrefs(v: unknown): Progress['prefs'] {
  const d = defaultPrefs();
  if (!isObj(v)) return d;
  const study = isObj(v.study) ? v.study : {};
  const follow = isObj(v.follow) ? v.follow : {};
  return {
    coords: bool(v.coords, d.coords),
    voice: bool(v.voice, d.voice),
    earsOnly: bool(v.earsOnly, d.earsOnly),
    recallChecks: bool(v.recallChecks, d.recallChecks),
    study: {
      kind: study.kind === 'middlegame' || study.kind === 'endgame' || study.kind === 'any' ? study.kind : d.study.kind,
      hide: study.hide === 'all' || study.hide === 'own-all' ? study.hide : d.study.hide,
    },
    follow: { pace: Math.min(2, Math.max(0, Math.round(num(follow.pace, d.follow.pace)))), aloud: bool(follow.aloud, d.follow.aloud) },
    onboarded: bool(v.onboarded, d.onboarded),
  };
}

/** Validate a current-version document field by field. */
function clean(v: Raw): Progress {
  const d = emptyProgress();
  const levels: Record<string, LevelRecord> = {};
  if (isObj(v.levels)) for (const [k, r] of Object.entries(v.levels)) {
    const c = cleanLevel(r);
    if (c) levels[k] = c;
  }
  const engineOffsets: Record<string, number> = {};
  if (isObj(v.engineOffsets)) for (const [k, o] of Object.entries(v.engineOffsets)) if (typeof o === 'number') engineOffsets[k] = o;
  const lostTrack: Progress['lostTrack'] = { white: {}, black: {} };
  if (isObj(v.lostTrack)) for (const o of ORIENTATIONS) {
    const side = v.lostTrack[o];
    if (isObj(side)) for (const [sq, n] of Object.entries(side)) if (isSquare(sq) && typeof n === 'number') lostTrack[o][sq] = n;
  }
  const review: Record<string, ReviewCard> = {};
  if (isObj(v.review)) for (const [k, c] of Object.entries(v.review)) {
    if (isObj(c) && day(c.due)) review[k] = { due: day(c.due)!, interval: Math.max(1, num(c.interval, 1)) };
  }
  const streak = isObj(v.streak) ? v.streak : {};
  const study = isObj(v.study) ? v.study : {};
  const follow = isObj(v.follow) ? v.follow : {};
  return {
    version: PROGRESS_VERSION,
    stats: cleanStats(v.stats),
    lostTrack,
    levels,
    streak: { days: Math.max(0, num(streak.days, 0)), lastDay: day(streak.lastDay) },
    bestRun: Math.max(0, num(v.bestRun, 0)),
    engineOffsets,
    study: { played: num(study.played, 0), passed: num(study.passed, 0) },
    follow: {
      plies: Math.min(30, Math.max(4, num(follow.plies, d.follow.plies))),
      rounds: num(follow.rounds, 0),
      perfect: num(follow.perfect, 0),
    },
    todayDone: day(v.todayDone),
    review,
    prefs: cleanPrefs(v.prefs),
  };
}

/**
 * Bring a saved document up to date. Returns null when it isn't a Mindboard
 * save at all (so an import can refuse it); empty input gives fresh progress.
 */
export function migrate(raw: unknown, legacyPrefs: Raw = {}): Progress | null {
  if (raw === undefined || raw === null) return emptyProgress();
  if (!isObj(raw) || typeof raw.version !== 'number') return null;
  let v: Raw = raw;
  if (v.version === 1) v = v1to2(v, legacyPrefs);
  if (v.version !== PROGRESS_VERSION) return null;
  return clean(v);
}

/** Old builds kept settings in localStorage; read them once so the move to v2 keeps them. */
export function readLegacyPrefs(storage: Pick<Storage, 'getItem'> | null): Raw {
  if (!storage) return {};
  const json = (k: string) => {
    try {
      return JSON.parse(storage.getItem(k) ?? 'null');
    } catch {
      return null;
    }
  };
  const out: Raw = {};
  const coords = storage.getItem('mindboard.coords');
  if (coords) out.coords = coords !== 'off';
  const voice = storage.getItem('mindboard.voice');
  if (voice) out.voice = voice === 'on';
  if (isObj(json('mindboard.study'))) out.study = json('mindboard.study');
  if (isObj(json('mindboard.follow'))) out.follow = json('mindboard.follow');
  // Anyone upgrading has used the app already.
  out.onboarded = true;
  return out;
}

