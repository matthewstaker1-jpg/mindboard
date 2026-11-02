import { useState } from 'react';
import { Board, type Highlight } from '../board/Board';
import { EMPTY_FEN, type Orientation, type Square } from '../board/squares';
import { LADDER, STAGE_NAMES } from '../levels/ladder';
import { currentLevelIndex, displayStreak, isPassed, isUnlocked, levelsPassed } from '../progress/progress';
import { weakestSquares } from '../progress/stats';
import { resetProgress, useProgress } from '../progress/store';
import './Journey.css';

export function Journey() {
  const { progress } = useProgress();
  const [side, setSide] = useState<Orientation>('white');
  if (!progress) return <div className="app" />;

  const cur = currentLevelIndex(progress);
  const allDone = cur >= LADDER.length;
  const level = LADDER[Math.min(cur, LADDER.length - 1)]!;
  const streak = displayStreak(progress, new Date());
  const stageLevels = LADDER.filter((l) => l.stage === level.stage);
  const weak = weakestSquares(progress.stats, side, 5);
  const hl: Partial<Record<Square, Highlight>> = {};
  for (const w of weak) hl[w.square] = 'warn';

  return (
    <div className="app journey">
      <header className="journey__top">
        <div className="journey__brand">
          <span className="journey__logo" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              <path d="M4 4l16 16" />
            </svg>
          </span>
          MINDBOARD
        </div>
        <span className="chip journey__streak" title="Days in a row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22c4 0 7-2.7 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4.3 3 7 7 7z" />
          </svg>
          {streak} {streak === 1 ? 'day' : 'days'}
        </span>
      </header>

      <section className="hero">
        {allDone ? (
          <>
            <p className="eyebrow">Stages 1–2 complete</p>
            <h1>Notation trainer done</h1>
            <p className="hero__blurb">Next comes fading the board against an engine. Replay any level below to keep sharp.</p>
          </>
        ) : (
          <>
            <p className="eyebrow">
              Stage {level.stage} · {STAGE_NAMES[level.stage]}
            </p>
            <h1>
              {level.title} · Level {cur + 1}
            </h1>
            <p className="hero__blurb">{level.blurb}</p>
            <div className="hero__segs" aria-hidden="true">
              {stageLevels.map((l) => (
                <span key={l.id} data-on={isPassed(progress, l.id) || undefined} data-cur={l.id === level.id || undefined} />
              ))}
            </div>
            <div className="hero__meta">
              <span>LEVELS PASSED</span>
              <span>
                {levelsPassed(progress)} / {LADDER.length}
              </span>
            </div>
            <a className="btn btn--primary btn--block hero__go" href={`#/drill/${level.id}`}>
              {progress.levels[level.id]?.attempts ? 'Continue' : 'Start'} →
            </a>
          </>
        )}
      </section>

      <section className="card weak">
        <div className="card__head">
          <h2>Weakest squares</h2>
          <div className="seg" role="group" aria-label="Board side">
            {(['white', 'black'] as const).map((o) => (
              <button key={o} type="button" data-on={side === o || undefined} onClick={() => setSide(o)}>
                {o === 'white' ? 'White' : 'Black'}
              </button>
            ))}
          </div>
        </div>
        {weak.length === 0 ? (
          <p className="muted weak__empty">
            Nothing yet from {side === 'white' ? "White's" : "Black's"} side. Play a few drills and the squares you miss or
            hesitate on show up here.
          </p>
        ) : (
          <div className="weak__body">
            <div className="weak__board">
              <Board fen={EMPTY_FEN} orientation={side} highlights={hl} label="Weakest squares" />
            </div>
            <ol className="weak__list">
              {weak.map((w) => (
                <li key={w.square}>
                  <span className="mono weak__sq">{w.square}</span>
                  <span>{Math.round(w.accuracy * 100)}%</span>
                  <span className="muted">{w.medianMs != null ? `${(w.medianMs / 1000).toFixed(1)}s` : ''}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section className="path">
        <div className="card__head">
          <h2>Your path</h2>
          <span className="eyebrow">
            {levelsPassed(progress)} / {LADDER.length} levels
          </span>
        </div>
        {[1, 2].map((stage) => (
          <div key={stage} className="path__stage">
            <p className="eyebrow path__stage-name">
              Stage {stage} · {STAGE_NAMES[stage]}
            </p>
            <ol>
              {LADDER.map((l, i) => {
                if (l.stage !== stage) return null;
                const passed = isPassed(progress, l.id);
                const open = isUnlocked(progress, i);
                const best = progress.levels[l.id]?.best;
                const state = passed ? 'done' : i === cur ? 'cur' : open ? 'open' : 'lock';
                const body = (
                  <>
                    <span className="path__node" data-state={state}>
                      {passed && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </span>
                    <span className="path__title">{l.title}</span>
                    <span className="mono path__meta">{best ? `${best.correct}/${best.total}` : ''}</span>
                  </>
                );
                return (
                  <li key={l.id} data-state={state}>
                    {open ? <a href={`#/drill/${l.id}`}>{body}</a> : <div>{body}</div>}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
        <ol className="path__later">
          {['Fog · pieces fade', 'Ghost army', 'Dark board', 'Full blindfold', 'Headphones mode'].map((t, i, a) => (
            <li key={t} data-state="lock">
              <div>
                <span className="path__node" data-state="lock" />
                <span className="path__title">{t}</span>
                <span className="mono path__meta path__goal">{i === a.length - 1 ? 'GOAL' : ''}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="journey__foot">
        <a href="#/gallery">Board gallery</a>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Reset all progress? This clears every level and square stat.')) void resetProgress();
          }}
        >
          Reset progress
        </button>
      </footer>
    </div>
  );
}
