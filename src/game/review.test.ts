import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { allStudyPositions, ENDGAMES } from '../chess/positions';
import { emptyProgress, effectiveElo, withEngineResult, withFollowRound, withTodayDone } from '../progress/progress';
import type { PlayedMove } from './fogGame';
import { biggestMistakes, formatEval, povCp } from './review';

const pm = (san: string, color: 'w' | 'b', moveNumber: number): PlayedMove => ({ san, color, moveNumber, from: 'a1', to: 'a2' });

describe('review', () => {
  it('turns engine scores into your point of view', () => {
    expect(povCp({ cp: 50 }, 'w', 'w')).toBe(50);
    expect(povCp({ cp: 50 }, 'b', 'w')).toBe(-50);
    expect(povCp({ mate: 2 }, 'b', 'b')).toBe(10_000);
    expect(povCp({ mate: -1 }, 'w', 'w')).toBe(-10_000);
  });

  it('finds your worst moves, ignoring theirs and lost positions', () => {
    const moves = [pm('e4', 'w', 1), pm('e5', 'b', 1), pm('Qh5', 'w', 2), pm('Nc6', 'b', 2), pm('Qxf7', 'w', 3)];
    // Before each ply, from White's view.
    const evals = [30, 30, 30, -20, -20, -400];
    const m = biggestMistakes(moves, evals, 'w');
    expect(m.map((x) => x.move.san)).toEqual(['Qxf7']);
    expect(m[0]!.drop).toBe(380);
    expect(biggestMistakes(moves, [-600, -600, -600, -600, -600, -1200], 'w')).toEqual([]);
  });

  it('formats evaluations', () => {
    expect(formatEval(125)).toBe('+1.3');
    expect(formatEval(-40)).toBe('-0.4');
    expect(formatEval(10_000)).toBe('mate');
  });
});

describe('study positions', () => {
  it('are all legal positions with a goal', () => {
    for (const p of allStudyPositions()) {
      const c = new Chess(p.fen);
      expect(c.isGameOver()).toBe(false);
      expect(c.moves().length).toBeGreaterThan(0);
    }
    expect(ENDGAMES.length).toBeGreaterThanOrEqual(4);
  });
});

describe('progress for the new modes', () => {
  it('moves the engine up after wins and down after losses, within limits', () => {
    let p = emptyProgress();
    p = withEngineResult(p, 'win');
    p = withEngineResult(p, 'win');
    p = withEngineResult(p, 'draw');
    expect(p.engineOffset).toBe(80);
    for (let i = 0; i < 30; i++) p = withEngineResult(p, 'loss');
    expect(p.engineOffset).toBe(-400);
    expect(effectiveElo(800, -400)).toBe(600);
    expect(effectiveElo(1300, 80)).toBe(1380);
  });

  it('lengthens Follow the moves after perfect rounds and shortens it after bad ones', () => {
    const now = new Date('2026-11-02T12:00:00');
    let p = withFollowRound(emptyProgress(), 3, 3, now);
    expect(p.follow.plies).toBe(8);
    p = withFollowRound(p, 2, 3, now);
    expect(p.follow.plies).toBe(8);
    p = withFollowRound(p, 1, 3, now);
    expect(p.follow.plies).toBe(6);
    expect(p.follow).toMatchObject({ rounds: 3, perfect: 1 });
  });

  it('marks Today as done and counts the day', () => {
    const p = withTodayDone(emptyProgress(), new Date('2026-11-02T12:00:00'));
    expect(p.todayDone).toBe('2026-11-02');
    expect(p.streak.days).toBe(1);
  });
});
