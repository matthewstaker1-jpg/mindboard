import { describe, expect, it } from 'vitest';
import { ALL_LEVELS } from '../levels/all';
import { LADDER } from '../levels/ladder';
import {
  currentLevelIndex,
  dayKey,
  displayStreak,
  emptyProgress,
  isMovedOn,
  isPassed,
  levelsPassed,
  movedOnLevels,
  withAnswer,
  withMovedOn,
  withSession,
} from './progress';
import { median, weakestSquares } from './stats';

const day = (s: string) => new Date(`${s}T12:00:00`);

describe('progress', () => {
  it('moves your place along as levels are passed', () => {
    let p = emptyProgress();
    expect(currentLevelIndex(p)).toBe(0);
    const l0 = LADDER[0]!;
    p = withSession(p, l0, { correct: 10, total: 20, medianMs: 1000 }, day('2026-11-02'));
    expect(currentLevelIndex(p)).toBe(0);
    p = withSession(p, l0, { correct: 20, total: 20, medianMs: 1000 }, day('2026-11-02'));
    expect(currentLevelIndex(p)).toBe(1);
    expect(p.levels[l0.id]).toMatchObject({ attempts: 2, passed: true, best: { correct: 20 } });
    // A worse replay keeps the pass and the best score.
    p = withSession(p, l0, { correct: 2, total: 20, medianMs: 1000 }, day('2026-11-02'));
    expect(p.levels[l0.id]).toMatchObject({ passed: true, best: { correct: 20 } });
    expect(levelsPassed(p)).toBe(1);
  });

  it('opens the next level after moving on, and keeps the old one to come back to', () => {
    const [l0, l1, l2] = LADDER;
    let p = withSession(emptyProgress(), l0!, { correct: 16, total: 20, medianMs: 1000 }, day('2026-11-02'));
    p = withMovedOn(p, l0!.id);
    expect(currentLevelIndex(p)).toBe(1);
    expect(isMovedOn(p, l0!.id)).toBe(true);
    expect(levelsPassed(p)).toBe(0);
    p = withMovedOn(p, l1!.id);
    expect(currentLevelIndex(p)).toBe(2);
    expect(movedOnLevels(p)).toEqual([l0!.id, l1!.id]);
    // Passing it later clears the come-back mark; the ladder position doesn't move back.
    p = withSession(p, l0!, { correct: 20, total: 20, medianMs: 1000 }, day('2026-11-03'));
    expect(isMovedOn(p, l0!.id)).toBe(false);
    expect(movedOnLevels(p)).toEqual([l1!.id]);
    expect(currentLevelIndex(p)).toBe(2);
    expect(LADDER[currentLevelIndex(p)]).toBe(l2);
  });

  it('follows you when you jump to any level', () => {
    const fail = { correct: 1, total: 20, medianMs: 1000 };
    const pass = { correct: 20, total: 20, medianMs: 1000 };
    const at = (i: number) => LADDER[i]!;
    // Tried it and didn't finish: carry on there.
    let p = withSession(emptyProgress(), at(7), { ...fail, total: at(7).questions }, day('2026-11-02'));
    expect(currentLevelIndex(p)).toBe(7);
    // Passed it: on to the next, skipped levels stay open behind you.
    p = withSession(p, at(7), { ...pass, correct: at(7).questions, total: at(7).questions }, day('2026-11-02'));
    expect(currentLevelIndex(p)).toBe(8);
    expect(isPassed(p, at(0).id)).toBe(false);
    // Replaying an early level doesn't pull you back.
    p = withSession(p, at(0), fail, day('2026-11-02'));
    expect(currentLevelIndex(p)).toBe(8);
  });

  it('sends you back to skipped levels once the end is done', () => {
    const p = emptyProgress();
    for (const l of ALL_LEVELS.slice(1)) p.levels[l.id] = { attempts: 1, passed: true, best: null };
    expect(currentLevelIndex(p)).toBe(0);
    p.levels[ALL_LEVELS[0]!.id] = { attempts: 1, passed: true, best: null };
    expect(currentLevelIndex(p)).toBe(ALL_LEVELS.length);
  });

  it('counts a day streak and resets after a missed day', () => {
    const l0 = LADDER[0]!;
    const s = { correct: 1, total: 20, medianMs: 1000 };
    let p = withSession(emptyProgress(), l0, s, day('2026-11-01'));
    p = withSession(p, l0, s, day('2026-11-01'));
    expect(p.streak.days).toBe(1);
    p = withSession(p, l0, s, day('2026-11-02'));
    expect(p.streak.days).toBe(2);
    expect(displayStreak(p, day('2026-11-03'))).toBe(2);
    expect(displayStreak(p, day('2026-11-04'))).toBe(0);
    p = withSession(p, l0, s, day('2026-11-05'));
    expect(p.streak.days).toBe(1);
  });

  it('handles streaks across month ends', () => {
    const l0 = LADDER[0]!;
    const s = { correct: 1, total: 20, medianMs: 1000 };
    let p = withSession(emptyProgress(), l0, s, day('2026-10-31'));
    p = withSession(p, l0, s, day('2026-11-01'));
    expect(p.streak.days).toBe(2);
    expect(dayKey(day('2026-11-01'))).toBe('2026-11-01');
  });

  it('records answers into the stats table and the best run', () => {
    let p = emptyProgress();
    p = withAnswer(p, 'white', 'c6', false, 2500, 0);
    p = withAnswer(p, 'white', 'c6', false, 2600, 0);
    p = withAnswer(p, 'white', 'e4', true, 800, 7);
    expect(p.stats.white.c6).toEqual({ seen: 2, correct: 0, times: [2500, 2600] });
    expect(p.bestRun).toBe(7);
    expect(weakestSquares(p.stats, 'both').map((w) => w.square)).toEqual(['c6']);
  });

  it('computes medians', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('spaced repetition', async () => {
  const { reviewAfter, dueSquares, emptyProgress: fresh } = await import('./progress');
  it('brings a missed square back tomorrow, then spaces it out, then retires it', () => {
    let r = reviewAfter({}, 'white:f6', false, day('2026-11-02'));
    expect(r['white:f6']).toEqual({ due: '2026-11-03', interval: 1 });
    // Right again the same day: not due yet, nothing changes.
    expect(reviewAfter(r, 'white:f6', true, day('2026-11-02'))).toBe(r);
    r = reviewAfter(r, 'white:f6', true, day('2026-11-03'));
    expect(r['white:f6']!.interval).toBeGreaterThan(1);
    expect(dueSquares({ ...fresh(), review: r }, day('2026-11-04')).has('white:f6')).toBe(false);
    for (let i = 0; i < 6; i++) {
      const due = r['white:f6']?.due;
      if (!due) break;
      r = reviewAfter(r, 'white:f6', true, day(due));
    }
    expect(r['white:f6']).toBeUndefined();
  });
});
