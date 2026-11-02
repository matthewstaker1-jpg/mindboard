import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GAME_LEVELS } from '../levels/games';

// A stand-in engine that always answers with the first legal-looking reply we give it.
const replies = ['e7e5', 'b8c6', 'g8f6'];
vi.mock('../engine/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../engine/engine')>();
  const engine = {
    ready: true,
    whenReady: async () => {},
    bestMove: vi.fn(async () => ({ best: replies.shift() ?? null, score: { cp: 0 } })),
    evaluate: vi.fn(async () => ({ best: null, score: { cp: 0 } })),
    newGame: vi.fn(async () => {}),
  };
  return { ...real, getEngine: () => engine, getReviewEngine: () => engine, onEngineLoad: () => () => {} };
});
vi.mock('idb-keyval', () => ({ get: vi.fn(async () => undefined), set: vi.fn(async () => {}) }));

const { FogGame } = await import('./FogGame');
const level = GAME_LEVELS.find((l) => l.id === 'fog-2')!;

describe('FogGame screen', () => {
  it('plays a typed move and shows the engine reply', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<FogGame level={{ ...level, side: 'white' }} />);
    const input = screen.getByLabelText('Type your move');
    fireEvent.change(input, { target: { value: 'e4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(document.querySelector('.movelist')?.textContent).toContain('1.e4');
    expect(document.querySelector('.movelist')?.textContent).toContain('e5');
    vi.useRealTimers();
  });

  it('an illegal move is reported as a slip', () => {
    render(<FogGame level={{ ...level, side: 'white' }} />);
    fireEvent.change(screen.getByLabelText('Type your move'), { target: { value: 'e5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByText(/isn't a legal move/)).toBeTruthy();
    expect(screen.getByTitle('Slips this game').textContent).toBe('1 slip');
  });

  it('resigning shows the result', () => {
    render(<FogGame level={{ ...level, side: 'white' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
    expect(screen.getByRole('heading', { name: 'You lost' })).toBeTruthy();
  });
});
