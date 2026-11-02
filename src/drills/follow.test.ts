import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { checkFollow, makeFollowRound, pieceText } from './follow';

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Follow the moves', () => {
  it('reads out the requested number of moves from a real line', () => {
    const r = makeFollowRound(8, seeded(1));
    expect(r.moves).toHaveLength(8);
    const c = new Chess();
    for (const m of r.moves) c.move(m.san);
    expect(c.fen()).toBe(r.fen);
  });

  it('asks three answerable questions with exactly one right option', () => {
    for (let i = 0; i < 40; i++) {
      const r = makeFollowRound(4 + (i % 14), seeded(i));
      const c = new Chess(r.fen);
      expect(r.questions.length).toBe(3);
      for (const q of r.questions) {
        const n = q.kind === 'yesNo' ? 2 : 4;
        expect(q.options.length).toBe(n);
        expect(new Set(q.options).size).toBe(n);
        const right = q.options.filter((o) => checkFollow(q, o));
        expect(right).toHaveLength(1);
        if (q.kind === 'whatsOn') expect(q.answer).toBe(pieceText(c.get(q.square)));
        else if (q.kind === 'where') for (const a of q.answers) expect(c.get(a)).toBeTruthy();
        else if (q.prompt.startsWith('Is ')) {
          const by = q.prompt.endsWith('White?') ? 'w' : 'b';
          expect(q.answer).toBe(c.isAttacked(q.square, by) ? 'Yes' : 'No');
        } else {
          const from = q.prompt.match(/on ([a-h][1-8]) take/)![1];
          const legal = c.moves({ verbose: true }).some((m) => m.from === from && m.to === q.square);
          expect(q.answer).toBe(legal ? 'Yes' : 'No');
        }
      }
    }
  });

  it('mixes in yes/no questions with both answers', () => {
    const answers = new Set<string>();
    let yesNo = 0;
    for (let i = 0; i < 60; i++) {
      for (const q of makeFollowRound(12, seeded(100 + i)).questions) {
        if (q.kind !== 'yesNo') continue;
        yesNo++;
        answers.add(q.answer);
      }
    }
    expect(yesNo).toBeGreaterThan(20);
    expect(answers).toEqual(new Set(['Yes', 'No']));
  });
});
