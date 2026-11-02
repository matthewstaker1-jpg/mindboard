import { describe, expect, it } from 'vitest';
import { canMoveOn, levelById, passes, warmupLevel } from './ladder';

const s = (correct: number, total = 20, medianMs: number | null = 1500) => ({ correct, total, medianMs });

describe('moving on after a near miss', () => {
  const nameBlack = levelById('name-black')!; // 90%
  const writeMove = levelById('write-quiet')!; // 85%, 15 questions

  it('allows 15/20 or better on a 90% level, but not 14/20', () => {
    expect(canMoveOn(nameBlack, s(15))).toBe(true);
    expect(canMoveOn(nameBlack, s(17))).toBe(true);
    expect(canMoveOn(nameBlack, s(14))).toBe(false);
  });

  it('allows 70% on an 85% level', () => {
    expect(canMoveOn(writeMove, s(11, 15))).toBe(true); // 73%
    expect(canMoveOn(writeMove, s(10, 15))).toBe(false); // 67%
  });

  it('is not offered for a pass or an unfinished session', () => {
    expect(passes(nameBlack, s(18))).toBe(true);
    expect(canMoveOn(nameBlack, s(18))).toBe(false);
    expect(canMoveOn(nameBlack, s(15, 19))).toBe(false);
  });

  it('ignores speed on the clock level', () => {
    const timed = levelById('timed')!;
    expect(passes(timed, s(19, 20, 4800))).toBe(true);
    expect(passes(timed, s(19, 20, 5600))).toBe(false);
    expect(canMoveOn(timed, s(19, 20, 5600))).toBe(true);
  });
});

describe('warm-up', () => {
  it('is ten squares with nothing to come back to', () => {
    const w = warmupLevel(true);
    expect(w.questions).toBe(10);
    expect(w.drills).toEqual(['nameSquare', 'tapSquare']);
  });

  it('adds the drill kinds and two questions for each level moved on from, up to 20', () => {
    const w = warmupLevel(false, [levelById('name-black')!, levelById('write-quiet')!, levelById('knight-paths')!]);
    expect(w.questions).toBe(16);
    expect(w.drills).toEqual(['nameSquare', 'tapSquare', 'writeMove', 'knightPath']);
    expect(w.labels).toBe(false);
    const many = warmupLevel(true, Array.from({ length: 8 }, () => levelById('read-move')!));
    expect(many.questions).toBe(20);
  });
});
