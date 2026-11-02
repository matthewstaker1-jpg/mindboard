import { useEffect, useMemo, useRef, useState } from 'react';
import { Board, type BoardProps, type Highlight } from '../board/Board';
import { isWhitePiece, parsePlacement, type Square } from '../board/squares';
import { getEngine } from '../engine/engine';
import {
  type GameState,
  answerRecall,
  engineMove,
  fenOf,
  gamePasses,
  hiddenMode,
  newGame,
  playerMoveSquares,
  playerMoveTyped,
  resign,
  spendPeek,
  turnOf,
  type PlayerMoveResult,
} from '../game/fogGame';
import { ALL_LEVELS, STAGE_NAMES, levelHref } from '../levels/all';
import type { GameLevel } from '../levels/games';
import { withGame } from '../progress/progress';
import { useProgress } from '../progress/store';
import { CoordsToggle, useCoordsPref } from '../ui/prefs';
import './FogGame.css';

const PEEK_MS = 2000;
const MIN_ENGINE_MS = 600;

function hideLabel(s: GameState): string {
  const h = s.shownAs.hide;
  switch (h.kind) {
    case 'none':
      return 'nothing hidden';
    case 'fog':
      return `${s.fogSquares.length} piece${s.fogSquares.length === 1 ? '' : 's'} in fog`;
    case 'own-pawns':
      return 'pawns hidden';
    case 'own-all':
      return 'all your pieces hidden';
    case 'all':
      return s.shownAs.view === 'board' || s.shownAs.view === 'dark' ? 'dark board' : 'no board';
  }
}

export function FogGame({ level }: { level: GameLevel }) {
  const { progress, update } = useProgress();
  const [coordsOn] = useCoordsPref();
  const [game, setGame] = useState<GameState>(() => newGame(level, Math.random));
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<{ tone: 'warn' | 'info'; text: string } | null>(null);
  const [ambiguous, setAmbiguous] = useState<{ san: string; uci: string }[] | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [recallFeedback, setRecallFeedback] = useState<{ correct: boolean; text: string } | null>(null);
  const recorded = useRef(false);

  const fen = useMemo(() => fenOf(game), [game]);
  const fenPieces = useMemo(() => parsePlacement(fen), [fen]);
  const last = game.moves.at(-1);
  const yourTurn = !game.result && !game.pendingRecall && turnOf(game) === game.color;
  const view = game.shownAs.view;
  const youAre = game.color === 'w' ? 'White' : 'Black';

  // Engine replies whenever it's its turn.
  useEffect(() => {
    if (game.result || game.pendingRecall || turnOf(game) === game.color) return;
    let cancelled = false;
    setThinking(true);
    const started = performance.now();
    getEngine()
      .bestMove(fen, game.level.engineElo)
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
  }, [fen, game.result, game.pendingRecall, game.color]);

  // Save the result once.
  useEffect(() => {
    if (!game.result || recorded.current) return;
    recorded.current = true;
    update((p) => withGame(p, level, game.result!.outcome, gamePasses(game), new Date()));
  }, [game.result, game, level, update]);

  useEffect(() => {
    if (game.droppedTo) setMessage({ tone: 'warn', text: `Two recall misses in a row: dropped back to ${game.droppedTo} for the rest of this game.` });
  }, [game.droppedTo]);

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
        setMessage({ tone: 'warn', text: `${r.message} That's a slip.` });
        break;
      case 'unreadable':
        setMessage({ tone: 'info', text: r.message });
        break;
    }
  };

  const submitTyped = () => {
    if (input.trim()) handle(playerMoveTyped(game, input));
  };

  const peek = () => {
    const next = spendPeek(game);
    if (!next || peeking) return;
    setGame(next);
    setPeeking(true);
    setTimeout(() => setPeeking(false), PEEK_MS);
  };

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
    setGame(newGame(level, Math.random));
    setInput('');
    setMessage(null);
    setAmbiguous(null);
    void getEngine().newGame();
  };

  if (import.meta.env.DEV) {
    (window as unknown as { __mindboard: unknown }).__mindboard = { game, fen, yourTurn, thinking };
  }

  const boardProps = (): BoardProps | null => {
    // List-only and full-blindfold levels show a board only while peeking.
    if (!(view === 'board' || view === 'dark' || peeking)) return null;
    const hl: Partial<Record<Square, Highlight>> = {};
    const marks: Partial<Record<Square, string>> = {};
    const dark = view === 'dark' && !peeking;
    if (last) {
      hl[last.from] = 'from';
      hl[last.to] = dark ? 'target' : 'from';
      if (dark && !peeking) marks[last.to] = last.san.replace(/[+#]/g, '');
    }
    const showAll = peeking;
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
      orientation: game.color === 'w' ? 'white' : 'black',
      hidden: showAll ? undefined : (sq, p) => (dark ? 'gone' : hiddenMode(game.shownAs.hide, game.color, game.fogSquares, sq, p)),
      highlights: hl,
      marks,
      tone: dark && !showAll ? 'dark' : 'standard',
      showLabels: coordsOn,
      ...moveInput,
    };
  };
  const bp = boardProps();

  const stageIdx = ALL_LEVELS.findIndex((l) => l.id === level.id);
  const next = ALL_LEVELS[stageIdx + 1];
  const record = progress?.levels[level.id];

  return (
    <div className="app game">
      <header className="game__top">
        <a href="#/" className="icon-btn" aria-label="Back to journey">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </a>
        <span className="game__title">
          STAGE {level.stage} · {level.title.toUpperCase()}
        </span>
        <CoordsToggle allowed />
      </header>

      <div className="player">
        <span className="player__badge">SF</span>
        <div className="player__who">
          <span>Engine</span>
          <span className="mono muted">≈{level.engineElo}</span>
        </div>
        {thinking && <span className="player__thinking">thinking…</span>}
      </div>

      {(view !== 'board' || !game.shownAs.showMoveList) && last && (
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
        <div className="game__board">
          <Board {...bp} label="Game board" />
        </div>
      )}

      <div className="player">
        <span className="player__badge player__badge--you">You</span>
        <div className="player__who">
          <span>You · {youAre}</span>
          <span className="mono muted">{hideLabel(game)}</span>
        </div>
        <span className="mono muted game__slips" title="Slips this game">
          {game.slips.length} slip{game.slips.length === 1 ? '' : 's'}
        </span>
      </div>

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
          <p className="muted recall__note">
            {recallFeedback ? recallFeedback.text : 'Miss two in a row and the fog steps back a level.'}
          </p>
        </section>
      )}

      {!game.result && !game.pendingRecall && (
        <div className="game__bar">
          <button type="button" className="peek" onClick={peek} disabled={game.peeksLeft === 0 || peeking}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>
              Peek <span className="mono">·{game.peeksLeft}</span>
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
              onChange={(e) => setInput(e.target.value)}
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
      {!game.result && (
        <button type="button" className="game__resign" onClick={() => setGame(resign(game))}>
          Resign
        </button>
      )}

      {game.result && (
        <section className="result">
          <p className="eyebrow">{STAGE_NAMES[level.stage]}</p>
          <h1 data-outcome={game.result.outcome}>
            {game.result.outcome === 'win' ? 'You won' : game.result.outcome === 'draw' ? 'Draw' : 'You lost'}
          </h1>
          <p className="muted">{game.result.reason}</p>
          <div className="results__stats">
            <div>
              <span className="mono">{game.slips.length}</span>
              <span>slips (max {level.pass.maxSlips})</span>
            </div>
            {game.recalls.asked > 0 && (
              <div>
                <span className="mono">
                  {game.recalls.correct}/{game.recalls.asked}
                </span>
                <span>recall checks</span>
              </div>
            )}
            <div>
              <span className="mono">
                {record?.passRun ?? 0}/{level.pass.gamesInARow}
              </span>
              <span>passing games in a row</span>
            </div>
          </div>
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
          {game.slips.length > 0 && (
            <ul className="result__slips">
              {game.slips.map((s, i) => (
                <li key={i}>
                  <span className="mono">Move {s.moveNumber}</span> {s.text}
                </li>
              ))}
            </ul>
          )}
          <div className="results__actions">
            <button type="button" className="btn btn--primary btn--block" onClick={restart}>
              New game
            </button>
            {record?.passed && next && (
              <a className="btn btn--block" href={levelHref(next)}>
                Next level: {next.title} →
              </a>
            )}
            <a className="btn btn--block" href="#/">
              Back to journey
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

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
