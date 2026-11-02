import { useState } from 'react';
import { Board, type Highlight } from '../board/Board';
import { EMPTY_FEN, type Orientation, type Square } from '../board/squares';
import { ALL_LEVELS, STAGE_NAMES, isGameLevel, levelHref } from '../levels/all';
import { currentLevelIndex, dayKey, displayStreak, engineOffset, shownElo, isPassed, isUnlocked, levelsPassed, recentPasses, type Progress } from '../progress/progress';
import { weakestSquares } from '../progress/stats';
import { currentProfile, exportProgress, importProgress, resetProgress, useProgress } from '../progress/store';
import './Journey.css';

export function Journey() {
  const { progress } = useProgress();
  const [side, setSide] = useState<Orientation>('white');
  if (!progress) return <div className="app" />;

  const cur = currentLevelIndex(progress);
  const allDone = cur >= ALL_LEVELS.length;
  const level = ALL_LEVELS[Math.min(cur, ALL_LEVELS.length - 1)]!;
  const streak = displayStreak(progress, new Date());
  const stageLevels = ALL_LEVELS.filter((l) => l.stage === level.stage);
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

      <a className="today" href="#/today" data-done={progress.todayDone === dayKey(new Date()) || undefined}>
        <span className="today__text">
          <span className="eyebrow">{progress.todayDone === dayKey(new Date()) ? 'Done today · go again?' : 'Today · 5–10 minutes'}</span>
          <span className="today__title">Warm-up, follow the moves, one study position</span>
        </span>
        <span className="today__go" aria-hidden="true">
          {progress.todayDone === dayKey(new Date()) ? '✓' : '→'}
        </span>
      </a>

      <section className="hero">
        {allDone ? (
          <>
            <p className="eyebrow">Every level passed</p>
            <h1>Full blindfold</h1>
            <p className="hero__blurb">Headphones mode comes next. Replay any level below to keep sharp.</p>
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
                {levelsPassed(progress)} / {ALL_LEVELS.length}
              </span>
            </div>
            {isGameLevel(level) && (
              <p className="hero__game mono">
                vs engine ≈{shownElo(level.engineElo, engineOffset(progress, level.id))} · {recentPasses(progress.levels[level.id], level)} of last {level.pass.of} counted · need {level.pass.need}
              </p>
            )}
            <a className="btn btn--primary btn--block hero__go" href={levelHref(level)}>
              {progress.levels[level.id]?.attempts ? 'Continue' : 'Start'} →
            </a>
            {!isGameLevel(level) && (
              <a className="hero__skip" href="#/placement">
                Already know the board? Take the placement test
              </a>
            )}
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

      <section className="card practice">
        <div className="card__head">
          <h2>Practice</h2>
        </div>
        <a href="#/study">
          <span>
            <span className="practice__title">Study and continue</span>
            <span className="muted">Study a position, it fades, play a short goal</span>
          </span>
          <span className="mono muted">
            {progress.study.played ? `${progress.study.passed}/${progress.study.played}` : ''}
          </span>
        </a>
        <a href="#/follow">
          <span>
            <span className="practice__title">Follow the moves</span>
            <span className="muted">No board: picture an opening, then answer</span>
          </span>
          <span className="mono muted">{progress.follow.plies} moves</span>
        </a>
        <a href="#/voice-lab">
          <span>
            <span className="practice__title">Voice lab</span>
            <span className="muted">Check how well your spoken moves are recognised</span>
          </span>
          <span />
        </a>
      </section>

      <section className="path">
        <div className="card__head">
          <h2>Your path</h2>
          <span className="eyebrow">
            {levelsPassed(progress)} / {ALL_LEVELS.length} levels
          </span>
        </div>
        {[1, 2, 3, 4].map((stage) => (
          <div key={stage} className="path__stage">
            <p className="eyebrow path__stage-name">
              Stage {stage} · {STAGE_NAMES[stage]}
            </p>
            <ol>
              {ALL_LEVELS.map((l, i) => {
                if (l.stage !== stage) return null;
                const passed = isPassed(progress, l.id);
                const open = isUnlocked(progress, i);
                const rec = progress.levels[l.id];
                const best = rec?.best;
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
                    <span className="mono path__meta">
                      {best ? `${best.correct}/${best.total}` : rec?.games ? `${rec.games.win}W ${rec.games.draw}D ${rec.games.loss}L` : ''}
                    </span>
                  </>
                );
                return (
                  <li key={l.id} data-state={state}>
                    {open ? <a href={levelHref(l)}>{body}</a> : <div>{body}</div>}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
        <ol className="path__later">
          <li data-state="lock">
            <div>
              <span className="path__node" data-state="lock" />
              <span className="path__title">Headphones mode</span>
              <span className="mono path__meta path__goal">GOAL</span>
            </div>
          </li>
        </ol>
      </section>

      <footer className="journey__foot">
        <a href="#/gallery">Board gallery</a>
        <button type="button" onClick={() => downloadBackup(progress)}>
          Back up
        </button>
        <label className="journey__restore">
          Restore
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (!window.confirm('Replace your progress with this backup?')) return;
              const err = importProgress(await file.text());
              window.alert(err ?? 'Progress restored.');
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Reset all progress? This clears every level and square stat.')) void resetProgress();
          }}
        >
          Reset progress
        </button>
      </footer>
      {currentProfile() && <p className="mono muted journey__profile">Profile: {currentProfile()} (separate from your real progress)</p>}
    </div>
  );
}

function downloadBackup(p: Progress) {
  const blob = new Blob([exportProgress(p)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mindboard-backup-${dayKey(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
