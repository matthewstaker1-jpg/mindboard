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
        expect(q.options.length).toBe(4);
        expect(new Set(q.options).size).toBe(4);
        const right = q.options.filter((o) => checkFollow(q, o));
        expect(right).toHaveLength(1);
        if (q.kind === 'whatsOn') expect(q.answer).toBe(pieceText(c.get(q.square)));
        else for (const a of q.answers) expect(c.get(a)).toBeTruthy();
      }
    }
  });
});
