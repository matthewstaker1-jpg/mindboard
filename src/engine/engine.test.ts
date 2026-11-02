import { describe, expect, it } from 'vitest';
import { Engine, UCI_ELO_MIN, parseBestMove, parseInfoPv, parseInfoScore, strengthFor, type UciWorker } from './engine';

/** A scripted stand-in for the Stockfish worker that records commands. */
function fakeWorker(reply: (cmd: string) => string[]) {
  const sent: string[] = [];
  const w: UciWorker = {
    onmessage: null,
    postMessage(cmd) {
      sent.push(cmd);
      const lines = reply(cmd);
      queueMicrotask(() => lines.forEach((l) => w.onmessage?.({ data: l })));
    },
    terminate() {},
  };
  return { w, sent };
}

function stockfishLike(cmd: string): string[] {
  if (cmd === 'uci') return ['id name Fake', 'uciok'];
  if (cmd === 'isready') return ['readyok'];
  if (cmd.startsWith('go')) return ['info depth 1 score cp 20 pv e7e5', 'info depth 2 score cp 35 pv e7e5', 'bestmove e7e5 ponder g1f3'];
  return [];
}

describe('UCI parsing', () => {
  it('reads scores and best moves', () => {
    expect(parseInfoScore('info depth 10 score cp -45 nodes 1')).toEqual({ cp: -45 });
    expect(parseInfoScore('info depth 10 score mate 3 pv')).toEqual({ mate: 3 });
    expect(parseInfoScore('info string hello')).toBeNull();
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('info depth 1')).toBeUndefined();
    expect(parseInfoPv('info depth 3 multipv 2 score cp 10 pv c7c5 g1f3')).toEqual({ index: 2, move: 'c7c5' });
    expect(parseInfoPv('info depth 3 score cp 10 pv e7e5')).toEqual({ index: 1, move: 'e7e5' });
    expect(parseInfoPv('info depth 3 score cp 10 upperbound pv e7e5')).toBeNull();
  });
});

describe('strength', () => {
  it('uses UCI_Elo from 1320 up and Skill Level below', () => {
    const strong = strengthFor(1600);
    expect(strong.options).toContainEqual(['UCI_Elo', '1600']);
    expect(strong.options).toContainEqual(['UCI_LimitStrength', 'true']);
    const weak = strengthFor(800);
    expect(weak.options).toContainEqual(['UCI_LimitStrength', 'false']);
    expect(weak.options).toContainEqual(['Skill Level', '0']);
    expect(weak.go).toBe('go depth 1');
    expect(strengthFor(1200).go).toBe('go depth 3');
    expect(strengthFor(800).mistakeRate).toBeGreaterThan(strengthFor(1200).mistakeRate);
    expect(strong.mistakeRate).toBe(0);
    expect(strengthFor(UCI_ELO_MIN).options).toContainEqual(['UCI_Elo', String(UCI_ELO_MIN)]);
  });
});

describe('Engine', () => {
  it('boots, sets strength once, and returns the best move with its score', async () => {
    const { w, sent } = fakeWorker(stockfishLike);
    const e = new Engine(() => w);
    const r = await e.bestMove('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 900);
    expect(r).toEqual({ best: 'e7e5', score: { cp: 35 } });
    expect(sent[0]).toBe('uci');
    expect(sent).toContain('setoption name Skill Level value 0');
    await e.bestMove('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 900);
    expect(sent.filter((c) => c.startsWith('setoption name Skill Level')).length).toBe(1);
  });

  it('sometimes plays another top candidate at low strength, never at high', async () => {
    const multi = (cmd: string) =>
      cmd.startsWith('go')
        ? ['info depth 1 multipv 1 score cp 40 pv e7e5', 'info depth 1 multipv 2 score cp 20 pv c7c5', 'bestmove e7e5']
        : stockfishLike(cmd);
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const slips = new Engine(() => fakeWorker(multi).w, () => 0); // always under the mistake rate
    expect((await slips.bestMove(fen, 800)).best).toBe('c7c5');
    expect((await slips.bestMove(fen, 1600)).best).toBe('e7e5');
    const steady = new Engine(() => fakeWorker(multi).w, () => 0.99);
    expect((await steady.bestMove(fen, 800)).best).toBe('e7e5');
  });

  it('runs searches one at a time', async () => {
    const { w, sent } = fakeWorker(stockfishLike);
    const e = new Engine(() => w);
    await Promise.all([e.bestMove('8/8/8/8/8/8/8/K6k w - - 0 1', 800), e.evaluate('8/8/8/8/8/8/8/K6k w - - 0 1')]);
    const gos = sent.map((c, i) => [c, i] as const).filter(([c]) => c.startsWith('go'));
    expect(gos).toHaveLength(2);
    // The second "position" comes after the first search's "go".
    const positions = sent.map((c, i) => [c, i] as const).filter(([c]) => c.startsWith('position'));
    expect(positions[1]![1]).toBeGreaterThan(gos[0]![1]);
  });

  it('restarts a stuck worker and gives up on that search after the timeout', async () => {
    let made = 0;
    let killed = 0;
    // The first worker never answers "go"; the replacement behaves.
    const make = () => {
      made++;
      const first = made === 1;
      const { w } = fakeWorker((cmd) => (first && cmd.startsWith('go') ? [] : stockfishLike(cmd)));
      w.terminate = () => void killed++;
      return w;
    };
    const e = new Engine(make, Math.random, { search: 50, boot: 1000 });
    await expect(e.bestMove('8/8/8/8/8/8/8/K6k w - - 0 1', 1500)).rejects.toThrow(/took too long/);
    expect(killed).toBe(1);
    expect(made).toBe(2);
    await expect(e.bestMove('8/8/8/8/8/8/8/K6k w - - 0 1', 1500)).resolves.toMatchObject({ best: 'e7e5' });
  });
});
