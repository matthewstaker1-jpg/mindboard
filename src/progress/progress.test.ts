import { describe, expect, it } from 'vitest';
import { LADDER } from '../levels/ladder';
import {
  currentLevelIndex,
  dayKey,
  displayStreak,
  emptyProgress,
  isUnlocked,
  levelsPassed,
  withAnswer,
  withSession,
} from './progress';
import { median, weakestSquares } from './stats';

const day = (s: string) => new Date(`${s}T12:00:00`);

describe('progress', () => {
  it('unlocks levels one at a time as they are passed', () => {
    let p = emptyProgress();
    expect(currentLevelIndex(p)).toBe(0);
    expect(isUnlocked(p, 1)).toBe(false);
    const l0 = LADDER[0]!;
    p = withSession(p, l0, { correct: 10, total: 20, medianMs: 1000 }, day('2026-11-02'));
    expect(currentLevelIndex(p)).toBe(0);
    p = withSession(p, l0, { correct: 20, total: 20, medianMs: 1000 }, day('2026-11-02'));
    expect(currentLevelIndex(p)).toBe(1);
    expect(isUnlocked(p, 1)).toBe(true);
    expect(p.levels[l0.id]).toMatchObject({ attempts: 2, passed: true, best: { correct: 20 } });
    // A worse replay keeps the pass and the best score.
    p = withSession(p, l0, { correct: 2, total: 20, medianMs: 1000 }, day('2026-11-02'));
    expect(p.levels[l0.id]).toMatchObject({ passed: true, best: { correct: 20 } });
    expect(levelsPassed(p)).toBe(1);
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
