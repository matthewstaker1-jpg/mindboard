import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { GAME_LEVELS, gameLevelById } from '../levels/games';
import { emptyProgress, isPassed, withGame } from '../progress/progress';
import {
  answerRecall,
  engineMove,
  fenOf,
  gamePasses,
  hiddenMode,
  makeRecall,
  newGame,
  pickFogSquares,
  playerMoveSquares,
  playerMoveTyped,
  resign,
  spendPeek,
  trackFog,
  type GameState,
} from './fogGame';

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const level = (id: string) => gameLevelById(id)!;

function playTyped(s: GameState, san: string): GameState {
  const r = playerMoveTyped(s, san);
  if (r.kind !== 'played') throw new Error(`${san}: ${r.kind}`);
  return r.state;
}

describe('fog tracking', () => {
  it('picks non-pawn, non-king pieces of your colour', () => {
    const sqs = pickFogSquares(new Chess(), 'w', 4, seeded(1));
    expect(sqs).toHaveLength(4);
    for (const s of sqs) expect(['a1', 'b1', 'c1', 'd1', 'f1', 'g1', 'h1']).toContain(s);
  });

  it('follows a fogged piece as it moves and forgets it when captured', () => {
    const c = new Chess();
    let fog = ['g1', 'c1'] as const as unknown as import('../board/squares').Square[];
    fog = trackFog(fog, c.move('Nf3'));
    expect(fog.sort()).toEqual(['c1', 'f3']);
    c.move('e5');
    fog = trackFog(fog, c.move('Nxe5'));
    expect(fog).toContain('e5');
    fog = trackFog(fog, c.move('Qe7'));
    fog = trackFog(fog, c.move('d4'));
    fog = trackFog(fog, c.move('Qxe5'));
    expect(fog).toEqual(['c1']);
  });

  it('moves the rook square on castling', () => {
    const c = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(trackFog(['h1'], c.move('O-O'))).toEqual(['f1']);
    expect(trackFog(['a8'], c.move('O-O-O'))).toEqual(['d8']);
  });
});

describe('hiding rules', () => {
  it('hides the right pieces for each rule', () => {
    expect(hiddenMode({ kind: 'fog', count: 2 }, 'w', ['c4'], 'c4', 'B')).toBe('gone');
    expect(hiddenMode({ kind: 'fog', count: 2 }, 'w', ['c4'], 'e4', 'P')).toBe('show');
    expect(hiddenMode({ kind: 'own-pawns' }, 'b', [], 'e5', 'p')).toBe('gone');
    expect(hiddenMode({ kind: 'own-pawns' }, 'b', [], 'e4', 'P')).toBe('show');
    expect(hiddenMode({ kind: 'own-all' }, 'w', [], 'e1', 'K')).toBe('gone');
    expect(hiddenMode({ kind: 'own-all' }, 'w', [], 'e8', 'k')).toBe('show');
    expect(hiddenMode({ kind: 'all' }, 'w', [], 'e8', 'k')).toBe('gone');
  });

  it('has a level ladder from fog to full blindfold with rising engine strength', () => {
    expect(GAME_LEVELS.at(-1)!.view).toBe('none');
    const elos = GAME_LEVELS.map((l) => l.engineElo);
    expect(elos).toEqual([...elos].sort((a, b) => a - b));
  });
});

describe('moves', () => {
  it('takes forgiving typed moves and squares, and logs illegal ones as slips', () => {
    let s = newGame(level('ghost-army'), seeded(2), 'w');
    s = playTyped(s, 'e4');
    expect(playerMoveTyped(s, 'e5').kind).toBe('unreadable'); // not your move
    s = engineMove(s, 'e7e5', seeded(3));
    const bad = playerMoveSquares(s, 'e4', 'e6');
    expect(bad.kind).toBe('slip');
    if (bad.kind === 'slip') {
      expect(bad.message).toMatch(/pawn on e4 can't go to e6/);
      s = bad.state;
    }
    const empty = playerMoveSquares(s, 'e3', 'e4');
    expect(empty.kind === 'slip' && empty.message).toMatch(/None of your pieces is on e3/);
    const r = playerMoveSquares(s, 'g1', 'f3');
    expect(r.kind).toBe('played');
    expect(s.slips).toHaveLength(1);
  });

  it('asks which move you meant when typing is ambiguous', () => {
    let s = newGame(level('fog-2'), seeded(4), 'w');
    for (const [me, them] of [['e4', 'e7e5'], ['Nf3', 'g8f6'], ['d4', 'e5d4']] as const) {
      s = playTyped(s, me);
      s = engineMove(s, them, seeded(5));
    }
    const r = playerMoveTyped(s, 'Nd2');
    expect(r.kind).toBe('ambiguous');
  });

  it('detects checkmate as a loss', () => {
    let s = newGame(level('fog-2'), seeded(6), 'w');
    s = playTyped(s, 'f3');
    s = engineMove(s, 'e7e5', seeded(7));
    s = playTyped(s, 'g4');
    s = engineMove(s, 'd8h4', seeded(8));
    expect(s.result).toEqual({ outcome: 'loss', reason: 'Checkmate' });
    expect(gamePasses(s)).toBe(false);
  });
});

describe('recall checks', () => {
  it('asks about a piece you cannot see, with one right option among four', () => {
    let s = newGame(level('ghost-army'), seeded(9), 'w');
    s = playTyped(s, 'e4');
    s = engineMove(s, 'e7e5', seeded(10));
    const r = makeRecall(s, seeded(11))!;
    expect(r.options).toHaveLength(4);
    expect(r.options.filter((o) => r.answers.includes(o))).toHaveLength(1);
    expect(r.prompt).toMatch(/^Where is/);
  });

  it('only asks about fogged pieces on fog levels', () => {
    const s = newGame(level('fog-2'), seeded(12), 'w');
    for (let i = 0; i < 20; i++) {
      const r = makeRecall(s, seeded(100 + i))!;
      expect(r.answers.some((a) => s.fogSquares.includes(a))).toBe(true);
    }
  });

  it('are off on every level for now', () => {
    for (const l of GAME_LEVELS) expect(l.recallEvery).toBeNull();
    let s = newGame(level('ghost-army'), seeded(30), 'w');
    for (const [me, them] of [['e4', 'e7e5'], ['Nf3', 'b8c6'], ['Bc4', 'f8c5'], ['c3', 'g8f6'], ['d3', 'd7d6'], ['O-O', 'e8g8'], ['Re1', 'a7a6'], ['h3', 'h7h6']] as const) {
      s = playTyped(s, me);
      s = engineMove(s, them, seeded(31));
      expect(s.pendingRecall).toBeNull();
    }
  });

  it('fire every few of your moves on a level that turns them on', () => {
    let s = newGame({ ...level('fog-2'), recallEvery: [4, 7] }, seeded(13), 'w');
    const at = s.nextRecallAt;
    expect(at).toBeGreaterThanOrEqual(4);
    expect(at).toBeLessThanOrEqual(7);
    const line = [['e4', 'e7e5'], ['Nf3', 'b8c6'], ['Bc4', 'f8c5'], ['c3', 'g8f6'], ['d3', 'd7d6'], ['O-O', 'e8g8'], ['Re1', 'a7a6']] as const;
    for (const [me, them] of line) {
      s = playTyped(s, me);
      s = engineMove(s, them, seeded(14));
      if (s.pendingRecall) break;
    }
    expect(s.pendingRecall).not.toBeNull();
    expect(s.ownMoves).toBe(at);
    expect(playerMoveTyped(s, 'h3').kind).toBe('unreadable'); // answer the check first
  });

  it('drops the fog back a level after two misses in a row', () => {
    let s = newGame(level('dark-board'), seeded(15), 'w');
    s = playTyped(s, 'e4');
    s = engineMove(s, 'e7e5', seeded(16));
    const miss = (st: GameState) => {
      const rc = makeRecall(st, seeded(17))!;
      const wrong = rc.options.find((o) => !rc.answers.includes(o))!;
      return answerRecall({ ...st, pendingRecall: rc }, wrong, seeded(18)).state;
    };
    s = miss(s);
    expect(s.shownAs.id).toBe('dark-board');
    s = miss(s);
    expect(s.shownAs.id).toBe('ghost-army');
    expect(s.droppedTo).toBe('Ghost army');
    expect(s.slips.filter((x) => x.kind === 'recall')).toHaveLength(2);
    // A right answer resets the run.
    const rc = makeRecall(s, seeded(19))!;
    const right = answerRecall({ ...s, pendingRecall: rc }, rc.answers[0]!, seeded(20));
    expect(right.correct).toBe(true);
    expect(right.state.recallMissRun).toBe(0);
  });
});

describe('peeks, resigning and passing', () => {
  it('limits peeks', () => {
    let s: GameState | null = newGame(level('blindfold'), seeded(21), 'w');
    s = spendPeek(s!);
    expect(s!.peeksLeft).toBe(0);
    expect(spendPeek(s!)).toBeNull();
  });

  it('counts a resignation as a loss', () => {
    const s = resign(newGame(level('fog-2'), seeded(22), 'w'));
    expect(s.result?.outcome).toBe('loss');
    expect(gamePasses(s)).toBe(false);
  });

  it('passes a level after three passing games in a row', () => {
    const fog2 = level('fog-2');
    let p = emptyProgress();
    const now = new Date('2026-11-02T12:00:00');
    p = withGame(p, fog2, 'win', true, now);
    p = withGame(p, fog2, 'draw', true, now);
    p = withGame(p, fog2, 'loss', false, now);
    expect(p.levels['fog-2']!.passRun).toBe(0);
    p = withGame(p, fog2, 'win', true, now);
    p = withGame(p, fog2, 'win', true, now);
    expect(isPassed(p, 'fog-2')).toBe(false);
    p = withGame(p, fog2, 'win', true, now);
    expect(isPassed(p, 'fog-2')).toBe(true);
    expect(p.levels['fog-2']!.games).toEqual({ win: 4, draw: 1, loss: 1 });
  });

  it('keeps the position consistent', () => {
    let s = newGame(level('fog-2'), seeded(23), 'b');
    s = engineMove(s, 'd2d4', seeded(24));
    s = playTyped(s, 'Nf6');
    expect(fenOf(s)).toBe('rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2');
  });
});
