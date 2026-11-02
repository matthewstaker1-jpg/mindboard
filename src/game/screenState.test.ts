import { describe, expect, it } from 'vitest';
import { GAME_LEVELS } from '../levels/games';
import { fenOf, newGame, playerMoveTyped } from './fogGame';
import { initialScreen, makeScreenReducer } from './screenState';

const rng = () => 0.3;
const reduce = makeScreenReducer(rng);
const level = GAME_LEVELS.find((l) => l.id === 'fog-2')!;
const fresh = () => initialScreen(newGame(level, rng, 'w'), false);

describe('screen reducer', () => {
  it('a played move clears the input and message', () => {
    let s = reduce(fresh(), { type: 'input', text: 'e 4' });
    expect(s.input).toBe('e4');
    s = reduce(s, { type: 'message', message: { tone: 'info', text: 'hi' } });
    s = reduce(s, { type: 'moveResult', result: playerMoveTyped(s.game, 'e4') });
    expect(s.input).toBe('');
    expect(s.message).toBeNull();
    expect(s.game.moves).toHaveLength(1);
  });

  it('ignores an engine reply to a position that has gone', () => {
    let s = reduce(fresh(), { type: 'moveResult', result: playerMoveTyped(fresh().game, 'e4') });
    const fen = fenOf(s.game);
    const stale = reduce(s, { type: 'engineMoved', fen: 'something else', uci: 'e7e5' });
    expect(stale.game.moves).toHaveLength(1);
    s = reduce(s, { type: 'engineMoved', fen, uci: 'e7e5' });
    expect(s.game.moves).toHaveLength(2);
  });

  it('charges held peek time when the peek ends', () => {
    const lvl = { ...level, peekBudgetMs: 10_000 };
    let s = initialScreen(newGame(lvl, rng, 'w'), false);
    s = reduce(s, { type: 'peekStart', at: 1000 });
    expect(s.peekSince).toBe(1000);
    s = reduce(s, { type: 'peekEnd', at: 3500 });
    expect(s.peekSince).toBeNull();
    expect(s.game.peekMsLeft).toBe(7500);
    expect(s.game.peekMsUsed).toBe(2500);
  });

  it("can't peek while studying", () => {
    const s = reduce(initialScreen(newGame(level, rng, 'w'), true), { type: 'peekStart', at: 1 });
    expect(s.peekSince).toBeNull();
  });

  it('resigning ends the game as a loss', () => {
    const s = reduce(fresh(), { type: 'resign' });
    expect(s.game.result?.outcome).toBe('loss');
  });

  it('take back removes your last move and the reply', () => {
    let s = reduce(fresh(), { type: 'moveResult', result: playerMoveTyped(fresh().game, 'e4') });
    s = reduce(s, { type: 'engineMoved', fen: fenOf(s.game), uci: 'e7e5' });
    s = reduce(s, { type: 'takeBack' });
    expect(s.game.moves).toHaveLength(0);
  });
});
