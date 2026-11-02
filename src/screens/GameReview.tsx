import { useState } from 'react';
import { Chess } from 'chess.js';
import { Board, type Highlight } from '../board/Board';
import type { Square } from '../board/squares';
import { getReviewEngine } from '../engine/engine';
import { type Color, type PlayedMove, replay } from '../game/fogGame';
import { type Mistake, biggestMistakes, formatEval, povCp } from '../game/review';

/** Long games get a shallower search so the review stays quick. */
const depthFor = (plies: number) => (plies > 80 ? 7 : plies > 40 ? 8 : 10);

interface Found extends Mistake {
  fenBefore: string;
  better: { san: string; from: Square; to: Square } | null;
}

/**
 * After the game, on request: the engine looks for the two moves that cost
 * you most. Quiet by design: nothing during play.
 */
export function GameReview({ startFen, moves, color }: { startFen: string; moves: PlayedMove[]; color: Color }) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [done, setDone] = useState(0);
  const [found, setFound] = useState<Found[]>([]);
  const own = moves.filter((m) => m.color === color).length;

  const run = async () => {
    setState('running');
    const engine = getReviewEngine();
    const c = new Chess(startFen);
    const fens = [c.fen()];
    for (const m of moves) {
      c.move(m.san);
      fens.push(c.fen());
    }
    const evals: number[] = [];
    const bests: (string | null)[] = [];
    const depth = depthFor(moves.length);
    for (let i = 0; i < fens.length; i++) {
      let r;
      try {
        r = await engine.evaluate(fens[i]!, depth);
      } catch {
        setState('failed');
        return;
      }
      const toMove = fens[i]!.split(' ')[1] as Color;
      evals.push(povCp(r.score, toMove, color));
      bests.push(r.best);
      setDone(i + 1);
    }
    const mistakes = biggestMistakes(moves, evals, color);
    setFound(
      mistakes.map((mk) => {
        const before = replay(startFen, moves.slice(0, mk.ply));
        const uci = bests[mk.ply];
        let better: Found['better'] = null;
        if (uci) {
          try {
            const b = before.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
            better = { san: b.san, from: b.from as Square, to: b.to as Square };
          } catch {
            better = null;
          }
        }
        return { ...mk, fenBefore: replay(startFen, moves.slice(0, mk.ply)).fen(), better };
      }),
    );
    setState('done');
  };

  if (own === 0) return null;
  if (state === 'idle') {
    return (
      <button type="button" className="btn btn--block review__go" onClick={run}>
        Review the game
      </button>
    );
  }
  if (state === 'running') {
    return (
      <p className="muted review__progress">
        Checking your moves… {done}/{moves.length + 1}
      </p>
    );
  }
  if (state === 'failed') {
    return (
      <button type="button" className="btn btn--block review__go" onClick={run}>
        The review stalled. Try again
      </button>
    );
  }
  if (found.length === 0) return <p className="muted">No big mistakes: nothing cost you two pawns or more.</p>;
  return (
    <div className="review">
      <p className="eyebrow">Biggest mistakes</p>
      {found.map((f) => {
        const hl: Partial<Record<Square, Highlight>> = { [f.move.from]: 'warn', [f.move.to]: 'warn' };
        if (f.better) {
          hl[f.better.from] = 'target';
          hl[f.better.to] = 'target';
        }
        return (
          <div key={f.ply} className="review__item">
            <div className="review__board">
              <Board fen={f.fenBefore} orientation={color === 'w' ? 'white' : 'black'} highlights={hl} showLabels={false} />
            </div>
            <p>
              <span className="mono">
                {f.move.moveNumber}
                {f.move.color === 'w' ? '.' : '…'}
                {f.move.san}
              </span>{' '}
              took it from {formatEval(f.before)} to {formatEval(f.after)}.
              {f.better && (
                <>
                  {' '}
                  Better was <span className="mono review__better">{f.better.san}</span>.
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
