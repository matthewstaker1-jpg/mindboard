import { useState } from 'react';
import { Board, type Highlight } from '../board/Board';
import { EMPTY_FEN, type Orientation, type Square } from '../board/squares';
import { ALL_LEVELS, STAGE_NAMES, isGameLevel, levelHref, stagePosition } from '../levels/all';
import { currentLevelIndex, dayKey, displayStreak, engineOffset, shownElo, isMovedOn, isPassed, levelsPassed, movedOnLevels, lostTrackSquares, dueSquares, recentPasses, withPrefs } from '../progress/progress';
import { weakestSquares } from '../progress/stats';
import { currentProfile, useProgress } from '../progress/store';
import './Journey.css';

export function Journey() {
  const { progress, update } = useProgress();
  const [side, setSide] = useState<Orientation>('white');
  const [allStages, setAllStages] = useState(false);
  if (!progress) return <div className="app" />;
  if (!progress.prefs.onboarded) return <Welcome onDone={(placement) => {
    update((p) => withPrefs(p, { onboarded: true }));
    if (placement) window.location.hash = '#/placement';
  }} />;

  const cur = currentLevelIndex(progress);
  const comeBack = movedOnLevels(progress).map((id) => ALL_LEVELS.find((l) => l.id === id)!);
  const reachedEnd = cur >= ALL_LEVELS.length;
  const allDone = reachedEnd && comeBack.length === 0;
  const level = ALL_LEVELS[Math.min(cur, ALL_LEVELS.length - 1)]!;
  const streak = displayStreak(progress, new Date());
  const stageLevels = ALL_LEVELS.filter((l) => l.stage === level.stage);
  const weak = weakestSquares(progress.stats, side, 5);
  const lost = lostTrackSquares(progress, side, 4);
  const due = dueSquares(progress, new Date()).size;
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
        <a href="#/help" className="icon-btn journey__icon" aria-label="How it works" title="How it works">
          ?
        </a>
        <a href="#/settings" className="icon-btn journey__icon" aria-label="Settings" title="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
            <circle cx="16" cy="6" r="2" />
            <circle cx="10" cy="12" r="2" />
            <circle cx="18" cy="18" r="2" />
          </svg>
        </a>
      </header>

      <a className="today" href="#/today" data-done={progress.todayDone === dayKey(new Date()) || undefined}>
        <span className="today__text">
          <span className="eyebrow">{progress.todayDone === dayKey(new Date()) ? 'Done today · go again?' : 'Today · 5–10 minutes'}</span>
          <span className="today__title">Warm-up, follow the moves, one study position</span>
          {due > 0 && (
            <span className="muted today__due">
              {due} square{due === 1 ? '' : 's'} due for review in the warm-up
            </span>
          )}
          {comeBack.some((l) => !isGameLevel(l)) && (
            <span className="muted today__due">
              Warm-up includes {comeBack.filter((l) => !isGameLevel(l)).map((l) => l.title).join(', ')}
            </span>
          )}
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
        ) : reachedEnd ? (
          <>
            <p className="eyebrow">Almost there</p>
            <h1>Come back to {comeBack.length === 1 ? 'one level' : `${comeBack.length} levels`}</h1>
            <p className="hero__blurb">
              You've been through the whole ladder. Pass {comeBack.map((l) => l.title).join(', ')} to finish it.
            </p>
            <a className="btn btn--primary btn--block" href={levelHref(comeBack[0]!)}>
              {comeBack[0]!.title} →
            </a>
          </>
        ) : (
          <>
            <p className="eyebrow">
              Stage {level.stage} · {STAGE_NAMES[level.stage]} · {stagePosition(level.id)!.index} of {stagePosition(level.id)!.count}
            </p>
            <h1>
              {level.title}
            </h1>
            <p className="hero__blurb">{level.blurb}</p>
            <div className="hero__segs" aria-hidden="true">
              {stageLevels.map((l) => (
                <span key={l.id} data-on={isPassed(progress, l.id) || undefined} data-back={isMovedOn(progress, l.id) || undefined} data-cur={l.id === level.id || undefined} />
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
        {lost.length > 0 && (
          <p className="muted weak__lost">
            Where you lose track in games: {lost.map((l) => `${l.square} (${l.count})`).join(', ')}
          </p>
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
        {[1, 2, 3, 4].filter((stage) => allStages || allDone || stage === level.stage).map((stage) => (
          <div key={stage} className="path__stage">
            <p className="eyebrow path__stage-name">
              Stage {stage} · {STAGE_NAMES[stage]}
            </p>
            <ol>
              {ALL_LEVELS.map((l, i) => {
                if (l.stage !== stage) return null;
                const passed = isPassed(progress, l.id);
                const rec = progress.levels[l.id];
                const best = rec?.best;
                const back = isMovedOn(progress, l.id);
                const state = passed ? 'done' : back ? 'back' : i === cur ? 'cur' : 'open';
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
                      {back && <span className="path__back">COME BACK · </span>}
                      {best ? `${best.correct}/${best.total}` : rec?.games ? `${rec.games.win}W ${rec.games.draw}D ${rec.games.loss}L` : ''}
                    </span>
                  </>
                );
                return (
                  <li key={l.id} data-state={state}>
                    <a href={levelHref(l)}>{body}</a>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
        {!allDone && (
          <button type="button" className="path__more" onClick={() => setAllStages(!allStages)}>
            {allStages ? 'Show just this stage' : 'Jump to any level'}
          </button>
        )}
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

      {currentProfile() && <p className="mono muted journey__profile">Profile: {currentProfile()} (separate from your real progress)</p>}
    </div>
  );
}

/** First launch: what this is, how it works, where to start. */
function Welcome({ onDone }: { onDone: (placement: boolean) => void }) {
  return (
    <div className="app welcome">
      <p className="eyebrow">Mindboard</p>
      <h1>Learn to play chess without seeing the board.</h1>
      <ol className="welcome__steps">
        <li>
          <strong>Learn the board.</strong> Name and find squares from both sides until it's automatic.
        </li>
        <li>
          <strong>Moves &amp; notation.</strong> Read and write moves until you can picture them.
        </li>
        <li>
          <strong>Fade the board.</strong> Play the computer while your pieces disappear one by one.
        </li>
        <li>
          <strong>Full blindfold.</strong> No board at all: just the moves, in your head.
        </li>
      </ol>
      <p className="muted">
        Ten minutes a day is plenty: the <em>Today</em> button picks a short mix for you. If you lose track of a piece in a
        game, that's a <em>slip</em>; a few are allowed. The <a href="#/help">help page</a> explains everything else.
      </p>
      <button type="button" className="btn btn--primary btn--block" onClick={() => onDone(false)} autoFocus>
        Start at the beginning
      </button>
      <button type="button" className="btn btn--block welcome__alt" onClick={() => onDone(true)}>
        I know the board: take the placement test
      </button>
    </div>
  );
}
