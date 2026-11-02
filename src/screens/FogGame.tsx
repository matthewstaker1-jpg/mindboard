import { Board, type BoardProps, type Highlight } from '../board/Board';
import { isWhitePiece, type Square } from '../board/squares';
import type { StudyPosition } from '../chess/positions';
import { strengthFor } from '../engine/engine';
import { hiddenMode, playerMoveSquares, playerMoveTyped } from '../game/fogGame';
import type { GameLevel } from '../levels/games';
import { useKeys } from '../ui/keypads';
import { CoordsToggle, useCoordsPref } from '../ui/prefs';
import { GameResult } from './game/GameResult';
import { BackLink, LastMove, MoveInput, MoveList, PeekButton, RecallPanel, goalLabel, hideLabel } from './game/parts';
import { useFogGame } from './game/useFogGame';
import { VoicePanel } from './VoicePanel';
import './FogGame.css';

export interface FogGameProps {
  level: GameLevel;
  /** Study and continue: study this position, then play its short goal. */
  scenario?: StudyPosition;
  /** When set (Today), the result screen offers Continue instead of New game. */
  onDone?: () => void;
}

export function FogGame({ level, scenario, onDone }: FogGameProps) {
  const [coordsOn] = useCoordsPref();
  const g = useFogGame(level, scenario);
  const { s, dispatch, fen, fenPieces, peeking, yourTurn, elo, orientation, handle } = g;
  const { game, studying } = s;
  const last = game.moves.at(-1);
  const view = game.shownAs.view;
  const youAre = game.color === 'w' ? 'White' : 'Black';

  useKeys(studying, (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      g.finishStudy();
    }
  });

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
            onMove: (f, t) => handle(playerMoveSquares(game, f, t), 'board'),
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
  const title = scenario ? `STUDY · ${scenario.title.toUpperCase()}` : `STAGE ${level.stage} · ${level.title.toUpperCase()}`;

  return (
    <div className="app game">
      <header className="game__top">
        <BackLink />
        <span className="game__title">{title}</span>
        <CoordsToggle allowed />
      </header>

      <div className="player">
        <span className="player__badge">SF</span>
        <div className="player__who">
          <span>Engine</span>
          <span className="mono muted" title="Measured strength of the engine settings in use">≈{strengthFor(elo).measured}</span>
        </div>
        {g.engineLoad.loading ? (
          <span className="player__thinking">
            loading engine{g.engineLoad.fraction !== null && g.engineLoad.fraction < 1 ? ` ${Math.round(g.engineLoad.fraction * 100)}%` : '…'}
          </span>
        ) : (
          s.thinking && <span className="player__thinking">thinking…</span>
        )}
      </div>

      {studying && scenario && (
        <section className="study">
          <p className="eyebrow">Study the position</p>
          <h2>
            You're {youAre}. {scenario.note}
          </h2>
          <p className="muted">
            Take as long as you like.{' '}
            {level.hide.kind === 'moved'
              ? 'Each of your pieces disappears once it has moved.'
              : `When you're ready, ${level.hide.kind === 'all' ? 'every piece' : 'your pieces'} will disappear.`}
          </p>
        </section>
      )}

      {!studying && (view !== 'board' || !game.shownAs.showMoveList) && <LastMove game={game} />}

      {bp && (
        <div className="game__board" data-peeking={peeking || undefined}>
          <Board {...bp} label="Game board" />
        </div>
      )}

      <div className="player">
        <span className="player__badge player__badge--you">You</span>
        <div className="player__who">
          <span>You · {youAre}</span>
          <span className="mono muted">{scenario && game.goal ? goalLabel(game) : hideLabel(game)}</span>
        </div>
        <span className="mono muted game__slips" title="Slips this game">
          {game.slips.length} slip{game.slips.length === 1 ? '' : 's'}
        </span>
      </div>

      {studying ? (
        <button type="button" className="btn btn--primary btn--block study__go" onClick={g.finishStudy}>
          I've got it. Hide the pieces <span className="drill__kbd">↵</span>
        </button>
      ) : (
        <>
          {(game.shownAs.showMoveList || view === 'list') && <MoveList game={game} />}

          {s.message && (
            <p className={`game__msg game__msg--${s.message.tone}`}>
              {s.message.text}
              {s.grace && (
                <button type="button" className="game__forgive" onClick={() => dispatch({ type: 'forgiveSlip' })}>
                  Misclick? Don't count it
                </button>
              )}
            </p>
          )}
          {s.ambiguous && (
            <div className="game__choices">
              {s.ambiguous.map((o) => (
                <button key={o.uci} type="button" className="btn" onClick={() => handle(playerMoveTyped(game, o.uci))}>
                  <span className="mono">{o.san}</span>
                </button>
              ))}
            </div>
          )}
          {s.engineError && <p className="game__msg game__msg--warn">The engine didn't load: {s.engineError}</p>}

          <RecallPanel s={s} onAnswer={(sq) => dispatch({ type: 'recallAnswer', square: sq })} />

          {!game.result && !game.pendingRecall && (
            <div className="game__bar">
              <PeekButton game={game} peeking={peeking} onStart={g.peekStart} onEnd={g.peekEnd} />
              <MoveInput
                value={s.input}
                yourTurn={yourTurn}
                onChange={(text) => dispatch({ type: 'input', text })}
                onSubmit={() => s.input.trim() && handle(playerMoveTyped(game, s.input))}
              />
            </div>
          )}

          {/* Stays mounted after the game so it can announce the result. */}
          <VoicePanel
            game={game}
            fen={fen}
            yourTurn={yourTurn}
            onMove={(text) => handle(playerMoveTyped(game, text), 'voice')}
            onTakeBack={() => dispatch({ type: 'takeBack' })}
            onResign={() => dispatch({ type: 'resign' })}
            onPeekSpend={(ms) => {
              dispatch({ type: 'peekSpend', ms });
              return game.peekMsLeft === null || game.peekMsLeft > 0;
            }}
          />

          {!game.result && (
            <div className="game__links">
              <button type="button" onClick={() => dispatch({ type: 'takeBack' })} disabled={!game.moves.some((m) => m.color === game.color)}>
                Take back
              </button>
              <button type="button" onClick={() => dispatch({ type: 'resign' })}>
                {scenario ? 'Give up' : 'Resign'}
              </button>
            </div>
          )}
        </>
      )}

      {game.result && (
        <GameResult
          game={game}
          level={level}
          scenario={scenario}
          record={g.progress?.levels[level.id]}
          studyPassed={g.studyPassed}
          evals={s.evals}
          onRestart={g.restart}
          onDone={onDone}
        />
      )}
    </div>
  );
}
