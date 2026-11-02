import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board, type BoardProps, type Highlight } from '../board/Board';
import { isWhitePiece, parsePlacement, type Square } from '../board/squares';
import type { StudyPosition } from '../chess/positions';
import { getEngine } from '../engine/engine';
import {
  type GameState,
  type PlayerMoveResult,
  answerRecall,
  canPeek,
  engineMove,
  fenOf,
  gamePasses,
  hiddenMode,
  newGame,
  playerMoveSquares,
  playerMoveTyped,
  resign,
  spendPeekTime,
  takeBack,
  turnOf,
} from '../game/fogGame';
import { povCp } from '../game/review';
import { ALL_LEVELS, STAGE_NAMES, levelHref } from '../levels/all';
import type { GameLevel } from '../levels/games';
import { effectiveElo, withAnswer, withGame, withStudy } from '../progress/progress';
import { useProgress } from '../progress/store';
import { useKeys } from '../ui/keypads';
import { CoordsToggle, useCoordsPref } from '../ui/prefs';
import { GameReview } from './GameReview';
import { VoicePanel } from './VoicePanel';
import './FogGame.css';

const MIN_ENGINE_MS = 600;
/** Study positions pass if you keep at least this much of the evaluation (centipawns). */
const STUDY_TOLERANCE = 150;
const STUDY_MAX_SLIPS = 1;

function hideLabel(s: GameState): string {
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

function secondsLeft(ms: number | null): string {
  return ms === null ? '∞' : `${Math.ceil(ms / 1000)}s`;
}

export interface FogGameProps {
  level: GameLevel;
  /** Study and continue: study this position, then play its short goal. */
  scenario?: StudyPosition;
  /** When set (Today), the result screen offers Continue instead of New game. */
  onDone?: () => void;
}

export function FogGame({ level, scenario, onDone }: FogGameProps) {
  const { progress, update } = useProgress();
  const [coordsOn] = useCoordsPref();
  const start = useCallback(
    () => newGame(level, Math.random, scenario ? { startFen: scenario.fen, goal: scenario.goal } : {}),
    [level, scenario],
  );
  const [game, setGame] = useState<GameState>(start);
  const [studying, setStudying] = useState(!!scenario);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<{ tone: 'warn' | 'info'; text: string } | null>(null);
  const [ambiguous, setAmbiguous] = useState<{ san: string; uci: string }[] | null>(null);
  const [peekSince, setPeekSince] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [recallFeedback, setRecallFeedback] = useState<{ correct: boolean; text: string } | null>(null);
  const [evals, setEvals] = useState<{ start: number | null; end: number | null }>({ start: null, end: null });
  const recorded = useRef(false);

  const fen = useMemo(() => fenOf(game), [game]);
  const fenPieces = useMemo(() => parsePlacement(fen), [fen]);
  const last = game.moves.at(-1);
  const peeking = peekSince !== null;
  const yourTurn = !studying && !game.result && !game.pendingRecall && turnOf(game) === game.color;
  const view = game.shownAs.view;
  const youAre = game.color === 'w' ? 'White' : 'Black';
  const elo = effectiveElo(level.engineElo, progress?.engineOffset ?? 0);
  const orientation = game.color === 'w' ? 'white' : 'black';

  // Engine replies whenever it's its turn.
  useEffect(() => {
    if (studying || game.result || game.pendingRecall || turnOf(game) === game.color) return;
    let cancelled = false;
    setThinking(true);
    const started = performance.now();
    getEngine()
      .bestMove(fen, elo)
      .then(async (r) => {
        const wait = MIN_ENGINE_MS - (performance.now() - started);
        if (wait > 0) await new Promise((res) => setTimeout(res, wait));
        if (cancelled || !r.best) return;
        setGame((g) => (fenOf(g) === fen ? engineMove(g, r.best!, Math.random) : g));
      })
      .catch((e) => !cancelled && setEngineError(String(e)))
      .finally(() => !cancelled && setThinking(false));
    return () => {
      cancelled = true;
    };
  }, [fen, game.result, game.pendingRecall, game.color, studying, elo]);

  // Study positions: judge "keep it as good as you found it" with the engine.
  const studyPassed = (): boolean | null => {
    if (!scenario || !game.result) return null;
    if (game.goalMet !== null) return game.goalMet && game.slips.length <= STUDY_MAX_SLIPS;
    if (evals.start === null || evals.end === null) return null;
    return evals.end - evals.start >= -STUDY_TOLERANCE && game.slips.length <= STUDY_MAX_SLIPS;
  };
  useEffect(() => {
    if (!scenario || !game.result || game.goalMet !== null || evals.end !== null) return;
    const c = turnOf(game);
    getEngine()
      .evaluate(fen, 12)
      .then((r) => setEvals((e) => ({ ...e, end: povCp(r.score, c, game.color) })))
      .catch(() => setEvals((e) => ({ ...e, end: e.start })));
  }, [scenario, game, fen, evals.end]);

  // Save the result once it's known.
  const passedStudy = studyPassed();
  useEffect(() => {
    if (!game.result || recorded.current) return;
    if (scenario) {
      if (passedStudy === null) return;
      recorded.current = true;
      update((p) => withStudy(p, passedStudy, new Date()));
      return;
    }
    recorded.current = true;
    const outcome = game.result.outcome === 'done' ? 'draw' : game.result.outcome;
    update((p) => withGame(p, level, outcome, gamePasses(game), new Date()));
  }, [game.result, game, level, update, scenario, passedStudy]);

  useEffect(() => {
    if (game.droppedTo) setMessage({ tone: 'warn', text: `Two recall misses in a row: dropped back to ${game.droppedTo} for the rest of this game.` });
  }, [game.droppedTo]);

  const recordSlipSquare = (sq?: Square) => {
    // Slips feed the square stats, so drills bring those squares up more often.
    if (sq) update((p) => withAnswer(p, orientation, sq, false, 4000, 0));
  };

  const handle = (r: PlayerMoveResult) => {
    setAmbiguous(null);
    switch (r.kind) {
      case 'played':
        setGame(r.state);
        setInput('');
        setMessage(null);
        break;
      case 'ambiguous':
        setAmbiguous(r.options);
        setMessage({ tone: 'info', text: 'Which one did you mean?' });
        break;
      case 'slip':
        setGame(r.state);
        recordSlipSquare(r.state.slips.at(-1)?.square);
        setMessage({ tone: 'warn', text: r.message });
        break;
      case 'unreadable':
        setMessage({ tone: 'info', text: r.message });
        break;
    }
    return r;
  };

  const submitTyped = () => {
    if (input.trim()) handle(playerMoveTyped(game, input));
  };

  // Hold to peek: the board shows while held; held time comes out of the budget.
  const peekStart = () => {
    if (peeking || studying || game.result || !canPeek(game)) return;
    setPeekSince(performance.now());
  };
  const peekEnd = useCallback(() => {
    setPeekSince((since) => {
      if (since !== null) setGame((g) => spendPeekTime(g, performance.now() - since));
      return null;
    });
  }, []);
  // Budgets run out even while held.
  useEffect(() => {
    if (peekSince === null || game.peekMsLeft === null) return;
    const t = setTimeout(peekEnd, game.peekMsLeft);
    return () => clearTimeout(t);
  }, [peekSince, game.peekMsLeft, peekEnd]);
  // Space bar works as the peek button (moves never contain spaces).
  useEffect(() => {
    if (studying || game.result) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      peekStart();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') peekEnd();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  const finishStudy = () => {
    setStudying(false);
    const c = turnOf(game);
    if (scenario?.goal.kind === 'moves') {
      getEngine()
        .evaluate(fen, 12)
        .then((r) => setEvals({ start: povCp(r.score, c, game.color), end: null }))
        .catch(() => setEvals({ start: 0, end: null }));
    }
  };
  useKeys(studying, (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishStudy();
    }
  });

  const answer = (sq: Square) => {
    const rc = game.pendingRecall;
    if (!rc || recallFeedback) return;
    const r = answerRecall(game, sq, Math.random);
    setRecallFeedback({ correct: r.correct, text: r.correct ? `${sq} — right.` : `It was ${rc.answers.join(' or ')}.` });
    setTimeout(() => {
      setRecallFeedback(null);
      setGame(r.state);
    }, r.correct ? 700 : 1600);
  };

  const restart = () => {
    recorded.current = false;
    setGame(start());
    setStudying(!!scenario);
    setEvals({ start: null, end: null });
    setInput('');
    setMessage(null);
    setAmbiguous(null);
    void getEngine().newGame();
  };

  const doTakeBack = () => {
    const t = takeBack(game);
    if (!t) return;
    setGame(t);
    setMessage({ tone: 'info', text: `Took back your last move. That counts as a slip.` });
  };

  if (import.meta.env.DEV) {
    (window as unknown as { __mindboard: unknown }).__mindboard = { game, fen, yourTurn, thinking, studying, peeking };
  }

  const boardProps = (): BoardProps | null => {
    const showAll = peeking || studying;
    // List-only and full-blindfold levels show a board only while peeking or studying.
    if (!(view === 'board' || view === 'dark' || showAll)) return null;
    const hl: Partial<Record<Square, Highlight>> = {};
    const marks: Partial<Record<Square, string>> = {};
    const dark = view === 'dark' && !showAll;
    if (last) {
      hl[last.from] = 'from';
      hl[last.to] = dark ? 'target' : 'from';
      if (dark) marks[last.to] = last.san.replace(/[+#]/g, '');
    }
    const moveInput: Partial<BoardProps> =
      yourTurn && !peeking
        ? {
            onMove: (f, t) => handle(playerMoveSquares(game, f, t)),
            canDrag: (_s, p) => isWhitePiece(p) === (game.color === 'w'),
            // Any square that doesn't show an opponent's piece can be where you think yours is.
            canSelect: (sq) => {
              const p = fenPieces.get(sq);
              if (!p) return true;
              const theirs = isWhitePiece(p) !== (game.color === 'w');
              return !(theirs && hiddenMode(game.shownAs.hide, game.color, game.fogSquares, sq, p) === 'show');
            },
          }
        : {};
    return {
      fen,
      orientation,
      hidden: showAll ? undefined : (sq, p) => (dark ? 'gone' : hiddenMode(game.shownAs.hide, game.color, game.fogSquares, sq, p)),
      highlights: hl,
      marks,
      tone: dark ? 'dark' : 'standard',
      showLabels: coordsOn,
      ...moveInput,
    };
  };
  const bp = boardProps();

  const idx = ALL_LEVELS.findIndex((l) => l.id === level.id);
  const next = scenario ? undefined : ALL_LEVELS[idx + 1];
  const record = progress?.levels[level.id];
  const title = scenario ? `STUDY · ${scenario.title.toUpperCase()}` : `STAGE ${level.stage} · ${level.title.toUpperCase()}`;

  return (
    <div className="app game">
      <header className="game__top">
        <a href="#/" className="icon-btn" aria-label="Back to journey">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </a>
        <span className="game__title">{title}</span>
        <CoordsToggle allowed />
      </header>

      <div className="player">
        <span className="player__badge">SF</span>
        <div className="player__who">
          <span>Engine</span>
          <span className="mono muted">≈{elo}</span>
        </div>
        {thinking && <span className="player__thinking">thinking…</span>}
      </div>

      {studying && scenario && (
        <section className="study">
          <p className="eyebrow">Study the position</p>
          <h2>
            You're {youAre}. {scenario.note}
          </h2>
          <p className="muted">
            Take as long as you like. When you're ready, {level.hide.kind === 'all' ? 'every piece' : 'your pieces'} will
            disappear.
          </p>
        </section>
      )}

      {!studying && (view !== 'board' || !game.shownAs.showMoveList) && last && (
        <div className="lastmove">
          <span className="muted">{last.color === game.color ? 'You played' : `${last.color === 'w' ? 'White' : 'Black'} played`}</span>
          <span className="lastmove__san mono">
            {last.moveNumber}
            {last.color === 'w' ? '.' : '…'}
            {last.san}
          </span>
        </div>
      )}

      {bp && (
        <div className="game__board" data-peeking={peeking || undefined}>
          <Board {...bp} label="Game board" />
        </div>
      )}

      <div className="player">
        <span className="player__badge player__badge--you">You</span>
        <div className="player__who">
          <span>You · {youAre}</span>
          <span className="mono muted">
            {scenario && game.goal ? goalLabel(game) : hideLabel(game)}
          </span>
        </div>
        <span className="mono muted game__slips" title="Slips this game">
          {game.slips.length} slip{game.slips.length === 1 ? '' : 's'}
        </span>
      </div>

      {studying ? (
        <button type="button" className="btn btn--primary btn--block study__go" onClick={finishStudy}>
          I've got it. Hide the pieces <span className="drill__kbd">↵</span>
        </button>
      ) : (
        <>
          {(game.shownAs.showMoveList || view === 'list') && <MoveList game={game} />}

          {message && <p className={`game__msg game__msg--${message.tone}`}>{message.text}</p>}
          {ambiguous && (
            <div className="game__choices">
              {ambiguous.map((o) => (
                <button key={o.uci} type="button" className="btn" onClick={() => handle(playerMoveTyped(game, o.uci))}>
                  <span className="mono">{o.san}</span>
                </button>
              ))}
            </div>
          )}
          {engineError && <p className="game__msg game__msg--warn">The engine didn't load: {engineError}</p>}

          {game.pendingRecall && (
            <section className="recall" aria-live="polite">
              <div className="recall__head">
                <span>RECALL CHECK</span>
              </div>
              <h2>{game.pendingRecall.prompt}</h2>
              <div className="recall__opts">
                {game.pendingRecall.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className="recall__opt mono"
                    disabled={!!recallFeedback}
                    data-state={recallFeedback ? (game.pendingRecall!.answers.includes(o) ? 'right' : undefined) : undefined}
                    onClick={() => answer(o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
              <p className="muted recall__note">{recallFeedback ? recallFeedback.text : 'Miss two in a row and the fog steps back a level.'}</p>
            </section>
          )}

          {!game.result && !game.pendingRecall && (
            <div className="game__bar">
              <button
                type="button"
                className="peek"
                disabled={!canPeek(game)}
                data-active={peeking || undefined}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  peekStart();
                }}
                onPointerUp={peekEnd}
                onPointerCancel={peekEnd}
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
              <form
                className="game__input"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitTyped();
                }}
              >
                <input
                  className="mono"
                  value={input}
                  onChange={(e) => setInput(e.target.value.replace(/\s/g, ''))}
                  placeholder={yourTurn ? 'Your move, e.g. Nf3' : 'Waiting…'}
                  disabled={!yourTurn}
                  autoFocus
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Type your move"
                />
                <button type="submit" className="btn btn--primary" disabled={!yourTurn || !input.trim()}>
                  Play
                </button>
              </form>
            </div>
          )}

          {/* Stays mounted after the game so it can announce the result. */}
          {(
            <VoicePanel
              game={game}
              fen={fen}
              yourTurn={yourTurn}
              onMove={(text) => handle(playerMoveTyped(game, text))}
              onTakeBack={doTakeBack}
              onResign={() => setGame(resign(game))}
              onPeekSpend={(ms) => (canPeek(game) ? (setGame((g) => spendPeekTime(g, ms)), true) : false)}
            />
          )}

          {!game.result && (
            <div className="game__links">
              <button type="button" onClick={doTakeBack} disabled={!game.moves.some((m) => m.color === game.color)}>
                Take back
              </button>
              <button type="button" onClick={() => setGame(resign(game))}>
                {scenario ? 'Give up' : 'Resign'}
              </button>
            </div>
          )}
        </>
      )}

      {game.result && (
        <section className="result">
          <p className="eyebrow">{scenario ? 'Study and continue' : STAGE_NAMES[level.stage]}</p>
          {scenario ? (
            <StudyResult game={game} passed={passedStudy} evals={evals} />
          ) : (
            <>
              <h1 data-outcome={game.result.outcome}>
                {game.result.outcome === 'win' ? 'You won' : game.result.outcome === 'draw' ? 'Draw' : 'You lost'}
              </h1>
              <p className="muted">{game.result.reason}</p>
            </>
          )}
          <div className="results__stats">
            <div>
              <span className="mono">{game.slips.length}</span>
              <span>slips (max {scenario ? STUDY_MAX_SLIPS : level.pass.maxSlips})</span>
            </div>
            <div>
              <span className="mono">{Math.round(game.peekMsUsed / 1000)}s</span>
              <span>peeking</span>
            </div>
            {!scenario && (
              <div>
                <span className="mono">
                  {record?.passRun ?? 0}/{level.pass.gamesInARow}
                </span>
                <span>passing games in a row</span>
              </div>
            )}
          </div>
          {!scenario && (
            <p className="muted">
              {gamePasses(game)
                ? 'That one counts.'
                : game.shownAs.id !== level.id
                  ? "Dropped back mid-game, so this one doesn't count."
                  : game.result.outcome === 'loss'
                    ? "A loss doesn't count."
                    : 'Too many slips for this one to count.'}
              {record?.passed ? ' Level passed.' : ''}
            </p>
          )}
          {game.slips.length > 0 && (
            <ul className="result__slips">
              {game.slips.map((s, i) => (
                <li key={i} data-kind={s.kind}>
                  <span className="mono">Move {s.moveNumber}</span> {s.text}
                </li>
              ))}
            </ul>
          )}
          <GameReview startFen={game.startFen} moves={game.moves} color={game.color} />
          <div className="results__actions">
            {onDone ? (
              <button type="button" className="btn btn--primary btn--block" onClick={onDone}>
                Continue →
              </button>
            ) : (
              <button type="button" className="btn btn--primary btn--block" onClick={restart}>
                {scenario ? 'Try it again' : 'New game'}
              </button>
            )}
            {scenario && !onDone && (
              <a className="btn btn--block" href={`#/study?n=${Date.now()}`}>
                Another position →
              </a>
            )}
            {record?.passed && next && !onDone && (
              <a className="btn btn--block" href={levelHref(next)}>
                Next level: {next.title} →
              </a>
            )}
            {!onDone && (
              <a className="btn btn--block" href="#/">
                Back to journey
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function goalLabel(g: GameState): string {
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

function StudyResult({ game, passed, evals }: { game: GameState; passed: boolean | null; evals: { start: number | null; end: number | null } }) {
  const goal = game.goal!;
  return (
    <>
      <h1 data-outcome={passed === null ? undefined : passed ? 'win' : 'loss'}>
        {passed === null ? 'Checking…' : passed ? 'Nailed it' : 'Not this time'}
      </h1>
      <p className="muted">
        {game.result!.reason}
        {goal.kind === 'moves' && evals.start !== null && evals.end !== null
          ? ` · position ${fmt(evals.start)} → ${fmt(evals.end)}`
          : ''}
      </p>
    </>
  );
}

const fmt = (cp: number) => `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;

function MoveList({ game }: { game: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ left: ref.current.scrollWidth });
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
