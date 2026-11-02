import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { Board } from './Board';
import { EMPTY_FEN, isWhitePiece, type Square } from './squares';

const ITALIAN = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R b KQkq - 1 4';

function cells(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('.board__sq'));
}
function cell(container: HTMLElement, sq: Square) {
  const el = container.querySelector<HTMLElement>(`[data-square="${sq}"]`);
  if (!el) throw new Error(`no ${sq}`);
  return el;
}

describe('Board', () => {
  it('renders 64 squares in screen order', () => {
    const { container } = render(<Board fen={EMPTY_FEN} />);
    const order = cells(container).map((c) => c.dataset.square);
    expect(order).toHaveLength(64);
    expect(order[0]).toBe('a8');
    expect(order[63]).toBe('h1');
  });

  it("draws g3 on Black's view in b6's slot on White's view", () => {
    const white = render(<Board fen={EMPTY_FEN} />);
    const idxB6 = cells(white.container).findIndex((c) => c.dataset.square === 'b6');
    white.unmount();
    const black = render(<Board fen={EMPTY_FEN} orientation="black" />);
    expect(cells(black.container)[idxB6]?.dataset.square).toBe('g3');
    expect(cells(black.container)[0]?.dataset.square).toBe('h1');
  });

  it('labels the left column with ranks and the bottom row with files', () => {
    const { container } = render(<Board fen={EMPTY_FEN} orientation="black" />);
    const ranks = Array.from(container.querySelectorAll('.board__label--rank')).map((e) => e.textContent);
    const files = Array.from(container.querySelectorAll('.board__label--file')).map((e) => e.textContent);
    expect(ranks).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(files).toEqual(['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']);
  });

  it('hides labels when showLabels is false', () => {
    const { container } = render(<Board fen={EMPTY_FEN} showLabels={false} />);
    expect(container.querySelectorAll('.board__label')).toHaveLength(0);
  });

  it('shows pieces, ghosts and removes them per square', () => {
    const { container } = render(<Board fen={ITALIAN} hidden={{ c4: 'ghost', f3: 'gone' }} />);
    expect(cell(container, 'e1').querySelector('.board__piece--w')).not.toBeNull();
    expect(cell(container, 'c6').querySelector('.board__piece--b')).not.toBeNull();
    expect(cell(container, 'c4').querySelector('.board__piece')).toBeNull();
    expect(cell(container, 'c4').querySelector('.board__ghost')).not.toBeNull();
    expect(cell(container, 'f3').querySelector('.board__piece')).toBeNull();
    expect(cell(container, 'f3').querySelector('.board__ghost')).toBeNull();
    expect(container.querySelectorAll('.board__piece')).toHaveLength(30);
  });

  it('accepts a hidden function of (square, piece)', () => {
    const { container } = render(<Board fen={ITALIAN} hidden={(_s, p) => (isWhitePiece(p) ? 'gone' : 'show')} />);
    expect(container.querySelectorAll('.board__piece--w')).toHaveLength(0);
    expect(container.querySelectorAll('.board__piece--b')).toHaveLength(16);
  });

  it('applies highlights, tone and marks', () => {
    const { container } = render(
      <Board fen={ITALIAN} tone="dark" highlights={{ c8: 'from', g4: 'target' }} marks={{ g4: 'Bg4', e1: '?' }} />,
    );
    expect(container.querySelector('.board')?.getAttribute('data-tone')).toBe('dark');
    expect(cell(container, 'c8').dataset.hl).toBe('from');
    expect(cell(container, 'g4').dataset.hl).toBe('target');
    expect(cell(container, 'g4').querySelector('.board__mark')?.textContent).toBe('Bg4');
    // A mark replaces the piece on its square.
    expect(cell(container, 'e1').querySelector('.board__piece')).toBeNull();
    expect(cell(container, 'e1').querySelector('.board__mark')?.textContent).toBe('?');
  });

  it('calls onTap with the square tapped, in either orientation', () => {
    const onTap = vi.fn();
    const { container, rerender } = render(<Board fen={EMPTY_FEN} onTap={onTap} />);
    fireEvent.click(cells(container)[0]!);
    expect(onTap).toHaveBeenLastCalledWith('a8');
    rerender(<Board fen={EMPTY_FEN} orientation="black" onTap={onTap} />);
    fireEvent.click(cells(container)[0]!);
    expect(onTap).toHaveBeenLastCalledWith('h1');
    fireEvent.click(cell(container, 'g3'));
    expect(onTap).toHaveBeenLastCalledWith('g3');
  });

  it('renders plain squares (not buttons) without onTap', () => {
    const { container } = render(<Board fen={EMPTY_FEN} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('describes visible content only in accessible names', () => {
    const { getByRole } = render(<Board fen={ITALIAN} hidden={{ c4: 'ghost', f3: 'gone' }} onTap={() => {}} />);
    expect(getByRole('button', { name: 'e1, white king' })).toBeTruthy();
    expect(getByRole('button', { name: 'c4, hidden piece' })).toBeTruthy();
    expect(getByRole('button', { name: 'f3' })).toBeTruthy();
  });

  describe('moving pieces', () => {
    // jsdom has no layout, so give the board a 400px box: squares are 50px.
    function setup(props: Partial<React.ComponentProps<typeof Board>> = {}) {
      const onMove = vi.fn();
      const utils = render(<Board fen={ITALIAN} onMove={onMove} {...props} />);
      const board = utils.container.querySelector<HTMLElement>('.board')!;
      board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON() {} });
      board.setPointerCapture = () => {};
      // Centre of a square in White's view.
      const at = (sq: string) => ({ clientX: (sq.charCodeAt(0) - 97) * 50 + 25, clientY: (8 - Number(sq[1])) * 50 + 25, button: 0, pointerId: 1 });
      return { ...utils, board, onMove, at };
    }

    it('reports a drag from one square to another', () => {
      const { board, onMove, at } = setup();
      fireEvent.pointerDown(board, at('f3'));
      fireEvent.pointerMove(board, at('e5'));
      fireEvent.pointerMove(board, at('d4'));
      fireEvent.pointerUp(board, at('d4'));
      expect(onMove).toHaveBeenCalledWith('f3', 'd4');
    });

    it('supports click the piece, then click the square', () => {
      const { board, onMove, at, container } = setup();
      fireEvent.pointerDown(board, at('c4'));
      fireEvent.pointerUp(board, at('c4'));
      expect(cell(container, 'c4').hasAttribute('data-selected')).toBe(true);
      fireEvent.pointerDown(board, at('f7'));
      expect(onMove).toHaveBeenCalledWith('c4', 'f7');
    });

    it('only lets you pick up pieces canDrag allows', () => {
      const { board, onMove, at } = setup({ canDrag: (_s, p) => isWhitePiece(p) });
      fireEvent.pointerDown(board, at('c6'));
      fireEvent.pointerMove(board, at('d4'));
      fireEvent.pointerUp(board, at('d4'));
      expect(onMove).not.toHaveBeenCalled();
    });

    it('ignores hidden pieces and drops back on the same square', () => {
      const { board, onMove, at } = setup({ hidden: { f3: 'ghost' } });
      fireEvent.pointerDown(board, at('f3'));
      fireEvent.pointerMove(board, at('d4'));
      fireEvent.pointerUp(board, at('d4'));
      fireEvent.pointerDown(board, at('e4'));
      fireEvent.pointerMove(board, at('e5'));
      fireEvent.pointerMove(board, at('e4'));
      fireEvent.pointerUp(board, at('e4'));
      expect(onMove).not.toHaveBeenCalled();
    });
  });
});
