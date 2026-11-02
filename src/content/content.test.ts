import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { loadContent } from './content';

describe('bundled Lichess content', async () => {
  const c = await loadContent();

  it('has enough of everything to avoid repeats', () => {
    expect(c.lines.length).toBeGreaterThan(3000);
    expect(c.lines.filter((l) => l.moves.length >= 30).length).toBeGreaterThanOrEqual(500);
    expect(c.middlegames.length).toBeGreaterThanOrEqual(300);
    expect(c.puzzles.filter((p) => p.goal?.kind === 'mate').length).toBeGreaterThanOrEqual(150);
  });

  it('every line replays legally', () => {
    for (const l of c.lines) {
      const g = new Chess();
      for (const m of l.moves) expect(() => g.move(m), `${l.name}: ${m}`).not.toThrow();
    }
  });

  it('every position is a legal, unfinished game with unique ids', () => {
    const ids = new Set<string>();
    for (const p of [...c.middlegames, ...c.puzzles]) {
      const g = new Chess(p.fen);
      expect(g.isGameOver(), p.id).toBe(false);
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
    }
  });
});
