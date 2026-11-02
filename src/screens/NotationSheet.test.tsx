import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NOTATION_CARDS, NotationSheet } from './NotationSheet';

describe('notation cheat sheet', () => {
  it('clicks through every card and ends with I am ready', () => {
    const onDone = vi.fn();
    render(<NotationSheet onDone={onDone} />);
    for (const card of NOTATION_CARDS.slice(0, -1)) {
      expect(screen.getByRole('heading', { name: card.title })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    }
    expect(screen.getByRole('heading', { name: NOTATION_CARDS.at(-1)!.title })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: "I'm ready →" }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('covers promotion, captures, castling and telling two pieces apart', () => {
    const examples = NOTATION_CARDS.flatMap((c) => c.rules.map((r) => r.example));
    expect(examples).toEqual(expect.arrayContaining(['e8=Q', 'dxc8=N', 'exd5', 'O-O', 'O-O-O', 'Nbd2', 'R1e2']));
  });

  it('can be skipped from the first card', () => {
    const onDone = vi.fn();
    render(<NotationSheet onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip, I know this' }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
