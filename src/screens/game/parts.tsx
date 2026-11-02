// Small presentational pieces of the game screen.

import { useEffect, useRef } from 'react';
import type { GameState } from '../../game/fogGame';
import { canPeek } from '../../game/fogGame';
import type { ScreenState } from '../../game/screenState';

export function hideLabel(s: GameState): string {
  const h = s.shownAs.hide;
  switch (h.kind) {
    case 'none':
      return 'nothing hidden';
    case 'fog':
      return `${s.fogSquares.length} piece${s.fogSquares.length === 1 ? '' : 's'} in fog`;
    case 'moved':
      return `${s.fogSquares.length} moved piece${s.fogSquares.length === 1 ? '' : 's'} hidden`;
    case 'own-pawns':
      return 'pawns hidden';
    case 'own-all':
      return 'all your pieces hidden';
    case 'all':
      return s.shownAs.view === 'board' || s.shownAs.view === 'dark' ? 'dark board' : 'no board';
  }
}

export function goalLabel(g: GameState): string {
  const goal = g.goal!;
  const left = (n: number) => `${Math.max(0, n - g.ownMoves)} of ${n} moves left`;
  switch (goal.kind) {
    case 'moves':
      return `Goal: hold the position · ${left(goal.n)}`;
    case 'mate':
      return `Goal: checkmate · ${left(goal.within)}`;
    case 'promote':
      return `Goal: promote · ${left(goal.within)}`;
  }
}

function secondsLeft(ms: number | null): string {
  return ms === null ? '∞' : `${Math.ceil(ms / 1000)}s`;
}

export function LastMove({ game }: { game: GameState }) {
  const last = game.moves.at(-1);
  if (!last) return null;
  return (
    <div className="lastmove">
      <span className="muted">{last.color === game.color ? 'You played' : `${last.color === 'w' ? 'White' : 'Black'} played`}</span>
      <span className="lastmove__san mono">
        {last.moveNumber}
        {last.color === 'w' ? '.' : '…'}
        {last.san}
      </span>
    </div>
  );
}

export function MoveList({ game }: { game: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo?.({ left: ref.current.scrollWidth });
  }, [game.moves.length]);
  if (game.moves.length === 0) return <div className="movelist muted">No moves yet.</div>;
  return (
    <div className="movelist mono" ref={ref}>
      {game.moves.map((m, i) => (
        <span key={i} className="movelist__m" data-last={i === game.moves.length - 1 || undefined}>
          {m.color === 'w' ? `${m.moveNumber}.` : i === 0 ? `${m.moveNumber}…` : ''}
          {m.san}
        </span>
      ))}
    </div>
  );
}

export function RecallPanel({ s, onAnswer }: { s: ScreenState; onAnswer: (sq: string) => void }) {
  const rc = s.game.pendingRecall;
  if (!rc) return null;
  const fb = s.recallFeedback;
  return (
    <section className="recall" aria-live="polite">
      <div className="recall__head">
        <span>RECALL CHECK</span>
      </div>
      <h2>{rc.prompt}</h2>
      <div className="recall__opts">
        {rc.options.map((o) => (
          <button
            key={o}
            type="button"
            className="recall__opt mono"
            disabled={!!fb}
            data-state={fb ? (rc.answers.includes(o) ? 'right' : undefined) : undefined}
            onClick={() => onAnswer(o)}
          >
            {o}
          </button>
        ))}
      </div>
      <p className="muted recall__note">{fb ? fb.text : 'Miss two in a row and the fog steps back a level.'}</p>
    </section>
  );
}

export function PeekButton({ game, peeking, onStart, onEnd }: { game: GameState; peeking: boolean; onStart: () => void; onEnd: () => void }) {
  return (
    <button
      type="button"
      className="peek"
      disabled={!canPeek(game)}
      data-active={peeking || undefined}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onStart();
      }}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onContextMenu={(e) => e.preventDefault()}
      title="Hold to see the board (or hold Space)"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span className="peek__text">
        <span>Hold to peek</span>
        <span className="mono peek__left">{secondsLeft(game.peekMsLeft)}</span>
      </span>
    </button>
  );
}

export function MoveInput({ value, yourTurn, onChange, onSubmit }: { value: string; yourTurn: boolean; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <form
      className="game__input"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        className="mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={yourTurn ? 'Your move, e.g. Nf3' : 'Waiting…'}
        disabled={!yourTurn}
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Type your move"
      />
      <button type="submit" className="btn btn--primary" disabled={!yourTurn || !value.trim()}>
        Play
      </button>
    </form>
  );
}

export function BackLink() {
  return (
    <a href="#/" className="icon-btn" aria-label="Back to journey">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </a>
  );
}
