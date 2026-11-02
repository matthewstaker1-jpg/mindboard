import { useState } from 'react';
import { ALL_LEVELS } from '../levels/all';
import type { SessionSummary } from '../levels/ladder';
import { PLACEMENT_FAST_MS, PLACEMENT_MOVES, PLACEMENT_SQUARES, placementSkips } from '../levels/placement';
import { withSkipped } from '../progress/progress';
import { useProgress } from '../progress/store';
import { BackLink } from './game/parts';
import { Drill } from './Drill';
import './Study.css';

type Step = 'intro' | 'squares' | 'moves' | 'done';

/** Skip ahead: 16 square questions, then (if those go well) 12 move questions. */
export function Placement() {
  const { update } = useProgress();
  const [step, setStep] = useState<Step>('intro');
  const [squares, setSquares] = useState<SessionSummary | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  const finish = (sq: SessionSummary, mv: SessionSummary | null) => {
    const ids = placementSkips(sq, mv);
    setSkipped(ids);
    if (ids.length) update((p) => withSkipped(p, ids));
    setStep('done');
  };

  if (step === 'squares')
    return (
      <Drill
        key="sq"
        level={PLACEMENT_SQUARES}
        onFinish={(s) => setSquares(s)}
        onDone={() => {
          // Moves are only worth testing if the squares part would skip all of Stage 1.
          const all = placementSkips(squares!, null);
          if (all.includes('timed')) setStep('moves');
          else finish(squares!, null);
        }}
      />
    );
  if (step === 'moves') return <Drill key="mv" level={PLACEMENT_MOVES} onFinish={(m) => finish(squares!, m)} onDone={() => setStep('done')} />;

  if (step === 'done') {
    const titles = ALL_LEVELS.filter((l) => skipped.includes(l.id)).map((l) => l.title);
    return (
      <div className="app today-done">
        <p className="eyebrow">Placement test</p>
        <h1>{titles.length ? `Skipped ${titles.length} levels` : 'Start from the beginning'}</h1>
        <p className="muted">
          {titles.length
            ? `You can go straight on from here. Skipped: ${titles.join(', ')}.`
            : 'Not quite enough right to skip anything yet. Level 1 will get you there quickly.'}
        </p>
        <a className="btn btn--primary btn--block" href="#/">
          Back to journey
        </a>
      </div>
    );
  }

  return (
    <div className="app study-setup">
      <header className="game__top">
        <BackLink />
        <span className="game__title">PLACEMENT TEST</span>
        <span className="follow__spacer" />
      </header>
      <h1>Already know the board?</h1>
      <p className="muted">
        A few minutes to skip levels you don't need. First {PLACEMENT_SQUARES.questions} squares, from both sides with no
        letters or numbers. Get {Math.round(PLACEMENT_SQUARES.pass.minAccuracy * 100)}% right to skip the board levels, and
        answer in under {PLACEMENT_FAST_MS / 1000}s on average to skip the timed one too.
      </p>
      <p className="muted">
        Then {PLACEMENT_MOVES.questions} move questions: get {Math.round(PLACEMENT_MOVES.pass.minAccuracy * 100)}% right to
        skip straight to the games. Nothing is lost if it goes badly.
      </p>
      <button type="button" className="btn btn--primary btn--block" onClick={() => setStep('squares')} autoFocus>
        Start the test →
      </button>
    </div>
  );
}
