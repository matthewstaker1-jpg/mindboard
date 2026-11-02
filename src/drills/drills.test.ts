import { describe, expect, it } from 'vitest';
import { ALL_SQUARES, type Square } from '../board/squares';
import { LADDER, levelById, passes } from '../levels/ladder';
import { emptyStats, recordAnswer, weakestSquares } from '../progress/stats';
import { knightTargets } from '../chess/notation';
import { checkAnswer, expectedAnswer, generateQuestion, moveMatchesFilter } from './questions';
import { pickAdaptive, retryGap } from './queue';
import { isFinished, newSession, nextQuestion, submitAnswer, summarise } from './session';

/** Small deterministic RNG (mulberry32). */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('adaptive queue', () => {
  it('asks weak squares far more often than solid ones', () => {
    let stats = emptyStats();
    for (const sq of ALL_SQUARES) {
      for (let i = 0; i < 6; i++) stats = recordAnswer(stats, 'white', sq, sq !== 'c6', 1200);
    }
    const rng = seeded(1);
    let c6 = 0;
    for (let i = 0; i < 2000; i++) if (pickAdaptive([...ALL_SQUARES], (s) => s, stats, 'white', [], rng) === 'c6') c6++;
    // Uniform would be ~31 of 2000.
    expect(c6).toBeGreaterThan(150);
  });

  it('keeps weakness separate for each orientation', () => {
    let stats = emptyStats();
    for (let i = 0; i < 5; i++) stats = recordAnswer(stats, 'black', 'g3', false, 4000);
    expect(weakestSquares(stats, 'black')[0]?.square).toBe('g3');
    expect(weakestSquares(stats, 'white')).toEqual([]);
  });

  it('avoids repeating recent squares', () => {
    const rng = seeded(2);
    const recent: Square[] = ['a1', 'b2', 'c3', 'd4'];
    for (let i = 0; i < 200; i++) {
      expect(recent).not.toContain(pickAdaptive([...ALL_SQUARES], (s) => s, emptyStats(), 'white', recent, rng));
    }
  });

  it('re-queues misses 3–5 questions later', () => {
    const rng = seeded(3);
    for (let i = 0; i < 100; i++) expect([3, 4, 5]).toContain(retryGap(rng));
  });

  it('brings a missed question back within 3–5 questions', () => {
    const rng = seeded(4);
    const level = levelById('name-white')!;
    let s = newSession(level);
    const first = nextQuestion(s, emptyStats(), rng);
    s = submitAnswer(first.session, first.question, 'zz', 1000, rng).session; // miss
    const missed = first.question.kind === 'nameSquare' ? first.question.square : null;
    let cameBackAt = -1;
    for (let i = 1; i <= 6; i++) {
      const n = nextQuestion(s, emptyStats(), rng);
      if (n.question.kind === 'nameSquare' && n.question.square === missed && cameBackAt < 0) cameBackAt = i;
      s = submitAnswer(n.session, n.question, expectedAnswer(n.question), 1000, rng).session;
    }
    expect(cameBackAt).toBeGreaterThanOrEqual(3);
    expect(cameBackAt).toBeLessThanOrEqual(5);
  });
});

describe('questions', () => {
  it('generates answerable questions for every level', () => {
    const rng = seeded(5);
    for (const level of LADDER) {
      for (let i = 0; i < 40; i++) {
        const q = generateQuestion({ level, stats: emptyStats(), recent: [], rng });
        expect(level.drills).toContain(q.kind);
        expect(checkAnswer(q, expectedAnswer(q).split(' or ')[0]!)).toBe(true);
        if (level.side !== 'mixed') expect(q.orientation).toBe(level.side);
        if (q.kind === 'writeMove' || q.kind === 'readMove') {
          expect(moveMatchesFilter(q.move, level.moves ?? 'any')).toBe(true);
          expect(q.orientation).toBe(q.move.color === 'w' ? 'white' : 'black');
        }
        if (q.kind === 'knightPath') {
          expect(q.mids.length).toBeGreaterThan(0);
          expect(knightTargets(q.from)).not.toContain(q.to);
          expect(q.from).not.toBe(q.to);
        }
      }
    }
  });

  it('marks wrong answers wrong', () => {
    const rng = seeded(6);
    const q = generateQuestion({ level: levelById('tap-black')!, stats: emptyStats(), recent: [], rng });
    expect(checkAnswer(q, q.kind === 'tapSquare' && q.square === 'a1' ? 'a2' : 'a1')).toBe(false);
  });
});

describe('session and passing', () => {
  it('runs a full level and passes with all answers right', () => {
    const rng = seeded(8);
    const level = levelById('write-captures')!;
    let s = newSession(level);
    while (!isFinished(s)) {
      const n = nextQuestion(s, emptyStats(), rng);
      s = submitAnswer(n.session, n.question, expectedAnswer(n.question), 900, rng).session;
    }
    const sum = summarise(s);
    expect(sum).toEqual({ correct: level.questions, total: level.questions, medianMs: 900 });
    expect(passes(level, sum)).toBe(true);
    expect(s.run).toBe(level.questions);
  });

  it('fails on accuracy, on speed for timed levels, and on short sessions', () => {
    const name = levelById('name-white')!;
    expect(passes(name, { correct: 18, total: 20, medianMs: 5000 })).toBe(true);
    expect(passes(name, { correct: 17, total: 20, medianMs: 1000 })).toBe(false);
    expect(passes(name, { correct: 10, total: 10, medianMs: 1000 })).toBe(false);
    const timed = levelById('timed')!;
    expect(passes(timed, { correct: 20, total: 20, medianMs: 2100 })).toBe(false);
    expect(passes(timed, { correct: 20, total: 20, medianMs: 1900 })).toBe(true);
  });

  it('resets the in-a-row run on a miss', () => {
    const rng = seeded(9);
    let s = newSession(levelById('name-white')!);
    for (const right of [true, true, false, true]) {
      const n = nextQuestion(s, emptyStats(), rng);
      s = submitAnswer(n.session, n.question, right ? expectedAnswer(n.question) : 'zz', 800, rng).session;
    }
    expect(s.run).toBe(1);
  });
});

describe('ladder', () => {
  it('has unique ids and at least 10 levels across Stages 1–2', () => {
    expect(new Set(LADDER.map((l) => l.id)).size).toBe(LADDER.length);
    expect(LADDER.length).toBeGreaterThanOrEqual(10);
    expect(LADDER.map((l) => l.stage)).toEqual([...LADDER.map((l) => l.stage)].sort());
  });
});
