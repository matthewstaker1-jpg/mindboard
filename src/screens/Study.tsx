import { useState } from 'react';
import { ENDGAMES, type StudyPosition, middlegamePositions } from '../chess/positions';
import { studyLevel } from '../levels/games';
import { useProgress } from '../progress/store';
import { FogGame } from './FogGame';
import './Study.css';

type Kind = 'middlegame' | 'endgame' | 'any';
type Hide = 'own-all' | 'all';
const PREF = 'mindboard.study';

function readPrefs(): { kind: Kind; hide: Hide } {
  try {
    return { kind: 'any', hide: 'own-all', ...JSON.parse(localStorage.getItem(PREF) ?? '{}') };
  } catch {
    return { kind: 'any', hide: 'own-all' };
  }
}

function pick(kind: Kind): StudyPosition {
  const pool = kind === 'middlegame' ? middlegamePositions() : kind === 'endgame' ? ENDGAMES : [...middlegamePositions(), ...ENDGAMES];
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** Study and continue: choose what kind of position and how much fades, then play it. */
export function Study({ onDone }: { onDone?: () => void }) {
  const { progress } = useProgress();
  const [prefs, setPrefs] = useState(readPrefs);
  // Today skips the setup and uses your last settings.
  const [position, setPosition] = useState<StudyPosition | null>(() => (onDone ? pick(readPrefs().kind) : null));

  const save = (p: { kind: Kind; hide: Hide }) => {
    setPrefs(p);
    try {
      localStorage.setItem(PREF, JSON.stringify(p));
    } catch {
      // Not remembered; fine for this visit.
    }
  };

  if (position) return <FogGame key={position.id} level={studyLevel(prefs.hide)} scenario={position} onDone={onDone} />;

  return (
    <div className="app study-setup">
      <header className="game__top">
        <a href="#/" className="icon-btn" aria-label="Back to journey">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </a>
        <span className="game__title">STUDY AND CONTINUE</span>
        <span className="follow__spacer" />
      </header>
      <h1>Study it. Then play it blind.</h1>
      <p className="muted">
        You get a position and as long as you like to look at it. When you're ready the pieces fade, and you play a short
        goal: hold a middlegame for 8 moves, or finish an endgame.
      </p>
      {progress && progress.study.played > 0 && (
        <p className="mono muted study-setup__record">
          {progress.study.passed}/{progress.study.played} positions nailed
        </p>
      )}
      <div className="study-setup__row">
        <span>Positions</span>
        <div className="seg" role="group" aria-label="Kind of position">
          {(['middlegame', 'endgame', 'any'] as const).map((k) => (
            <button key={k} type="button" data-on={prefs.kind === k || undefined} onClick={() => save({ ...prefs, kind: k })}>
              {k === 'any' ? 'Both' : k[0]!.toUpperCase() + k.slice(1) + 's'}
            </button>
          ))}
        </div>
      </div>
      <div className="study-setup__row">
        <span>Then hide</span>
        <div className="seg" role="group" aria-label="What fades">
          {(['own-all', 'all'] as const).map((h) => (
            <button key={h} type="button" data-on={prefs.hide === h || undefined} onClick={() => save({ ...prefs, hide: h })}>
              {h === 'all' ? 'Everything' : 'Your pieces'}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="btn btn--primary btn--block" onClick={() => setPosition(pick(prefs.kind))} autoFocus>
        Show me a position →
      </button>
    </div>
  );
}
