import { useState } from 'react';
import { ALL_LEVELS } from '../levels/all';
import { warmupLevel } from '../levels/ladder';
import { displayStreak, isPassed, withTodayDone } from '../progress/progress';
import { useProgress } from '../progress/store';
import { Drill } from './Drill';
import { FollowMoves } from './FollowMoves';
import { Study } from './Study';
import './Study.css';

const STEPS = ['Warm-up', 'Follow the moves', 'Study a position'] as const;

/**
 * One button a day, 5–10 minutes: a quick square warm-up, a round of Follow
 * the moves, and one study position. Weak squares come up in the warm-up by
 * themselves, because the drill queue favours them.
 */
export function Today() {
  const { progress, update } = useProgress();
  const [step, setStep] = useState(0);
  if (!progress) return <div className="app" />;

  const next = () => {
    if (step + 1 >= STEPS.length) update((p) => withTodayDone(p, new Date()));
    setStep(step + 1);
    window.scrollTo(0, 0);
  };
  // Labels come off once you've passed the labels-off levels.
  const labels = !isPassed(progress, ALL_LEVELS.find((l) => l.id === 'name-nolabels')!.id);

  const bar = (
    <div className="today-bar">
      TODAY ·
      {STEPS.map((s, i) => (
        <span key={s} data-on={i === step || undefined} data-done={i < step || undefined}>
          {i + 1}. {s.toUpperCase()}
        </span>
      ))}
    </div>
  );

  if (step >= STEPS.length) {
    const days = displayStreak(progress, new Date());
    return (
      <div className="app today-done">
        <p className="eyebrow">Today</p>
        <h1>Done for today</h1>
        <p className="muted">
          {days} day{days === 1 ? '' : 's'} in a row. Come back tomorrow, or keep going on the ladder.
        </p>
        <a className="btn btn--primary btn--block" href="#/">
          Back to journey
        </a>
      </div>
    );
  }

  return (
    <>
      {bar}
      {step === 0 && <Drill key="warmup" level={warmupLevel(labels)} onDone={next} />}
      {step === 1 && <FollowMoves key="follow" onDone={next} />}
      {step === 2 && <Study key="study" onDone={next} />}
    </>
  );
}
