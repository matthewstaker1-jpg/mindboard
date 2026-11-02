// The game screen's side effects around the pure screen reducer: the engine
// loop, study evaluations, saving the result, and the peek timer/Space key.

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { parsePlacement } from '../../board/squares';
import type { StudyPosition } from '../../chess/positions';
import { getEngine } from '../../engine/engine';
import { type PlayerMoveResult, fenOf, gamePasses, newGame, turnOf } from '../../game/fogGame';
import { povCp } from '../../game/review';
import { initialScreen, makeScreenReducer } from '../../game/screenState';
import type { GameLevel } from '../../levels/games';
import { effectiveElo, engineOffset, withAnswer, withGame, withStudy } from '../../progress/progress';
import { useProgress } from '../../progress/store';

const MIN_ENGINE_MS = 600;
/** Study positions pass if you keep at least this much of the evaluation (centipawns). */
export const STUDY_TOLERANCE = 150;
export const STUDY_MAX_SLIPS = 1;
const reducer = makeScreenReducer(Math.random);

export function useFogGame(level: GameLevel, scenario?: StudyPosition) {
  const { progress, update } = useProgress();
  const start = useCallback(
    () => newGame(level, Math.random, scenario ? { startFen: scenario.fen, goal: scenario.goal } : {}),
    [level, scenario],
  );
  const [s, dispatch] = useReducer(reducer, undefined, () => initialScreen(start(), !!scenario));
  const { game, studying, peekSince } = s;
  const recorded = useRef(false);

  const fen = useMemo(() => fenOf(game), [game]);
  const fenPieces = useMemo(() => parsePlacement(fen), [fen]);
  const peeking = peekSince !== null;
  const toMove = turnOf(game);
  const yourTurn = !studying && !game.result && !game.pendingRecall && toMove === game.color;
  const engineTurn = !studying && !game.result && !game.pendingRecall && toMove !== game.color;
  const elo = effectiveElo(level.engineElo, progress ? engineOffset(progress, level.id) : 0);
  const orientation = game.color === 'w' ? 'white' : 'black';

  // Engine replies whenever it's its turn.
  useEffect(() => {
    if (!engineTurn) return;
    let cancelled = false;
    dispatch({ type: 'engineThinking', on: true });
    const started = performance.now();
    getEngine()
      .bestMove(fen, elo)
      .then(async (r) => {
        const wait = MIN_ENGINE_MS - (performance.now() - started);
        if (wait > 0) await new Promise((res) => setTimeout(res, wait));
        if (!cancelled && r.best) dispatch({ type: 'engineMoved', fen, uci: r.best });
      })
      .catch((e) => !cancelled && dispatch({ type: 'engineError', error: String(e) }))
      .finally(() => !cancelled && dispatch({ type: 'engineThinking', on: false }));
    return () => {
      cancelled = true;
    };
  }, [fen, engineTurn, elo]);

  // Study positions: judge "keep it as good as you found it" with the engine.
  const studyPassed: boolean | null = (() => {
    if (!scenario || !game.result) return null;
    if (game.goalMet !== null) return game.goalMet && game.slips.length <= STUDY_MAX_SLIPS;
    if (s.evals.start === null || s.evals.end === null) return null;
    return s.evals.end - s.evals.start >= -STUDY_TOLERANCE && game.slips.length <= STUDY_MAX_SLIPS;
  })();
  const needEndEval = !!scenario && !!game.result && game.goalMet === null && s.evals.end === null;
  useEffect(() => {
    if (!needEndEval) return;
    getEngine()
      .evaluate(fen, 12)
      .then((r) => dispatch({ type: 'evalEnd', cp: povCp(r.score, toMove, game.color) }))
      .catch(() => dispatch({ type: 'evalEnd', cp: s.evals.start ?? 0 }));
  }, [needEndEval, fen, toMove, game.color, s.evals.start]);

  // Save the result once it's known.
  useEffect(() => {
    if (!game.result || recorded.current) return;
    if (scenario) {
      if (studyPassed === null) return;
      recorded.current = true;
      update((p) => withStudy(p, studyPassed, new Date()));
      return;
    }
    recorded.current = true;
    const outcome = game.result.outcome === 'done' ? 'draw' : game.result.outcome;
    update((p) => withGame(p, level, outcome, gamePasses(game), new Date()));
  }, [game, level, update, scenario, studyPassed]);

  const handle = useCallback(
    (r: PlayerMoveResult) => {
      dispatch({ type: 'moveResult', result: r });
      // Slips feed the square stats, so drills bring those squares up more often.
      const sq = r.kind === 'slip' ? r.state.slips.at(-1)?.square : undefined;
      if (sq) update((p) => withAnswer(p, orientation, sq, false, 4000, 0));
      return r;
    },
    [update, orientation],
  );

  // Hold to peek: the board shows while held; held time comes out of the budget.
  const peekStart = useCallback(() => dispatch({ type: 'peekStart', at: performance.now() }), []);
  const peekEnd = useCallback(() => dispatch({ type: 'peekEnd', at: performance.now() }), []);
  // Budgets run out even while held.
  useEffect(() => {
    if (peekSince === null || game.peekMsLeft === null) return;
    const t = setTimeout(peekEnd, game.peekMsLeft);
    return () => clearTimeout(t);
  }, [peekSince, game.peekMsLeft, peekEnd]);
  // Space bar works as the peek button (moves never contain spaces).
  const playing = !studying && !game.result;
  useEffect(() => {
    if (!playing) return;
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
  }, [playing, peekStart, peekEnd]);

  const finishStudy = useCallback(() => {
    dispatch({ type: 'finishStudy' });
    if (scenario?.goal.kind === 'moves') {
      getEngine()
        .evaluate(fen, 12)
        .then((r) => dispatch({ type: 'evalStart', cp: povCp(r.score, toMove, game.color) }))
        .catch(() => dispatch({ type: 'evalStart', cp: 0 }));
    }
  }, [scenario, fen, toMove, game.color]);

  // Recall feedback shows briefly, then the game moves on.
  useEffect(() => {
    if (!s.recallFeedback) return;
    const t = setTimeout(() => dispatch({ type: 'recallDone' }), s.recallFeedback.correct ? 700 : 1600);
    return () => clearTimeout(t);
  }, [s.recallFeedback]);

  const restart = useCallback(() => {
    recorded.current = false;
    dispatch({ type: 'restart', game: start(), studying: !!scenario });
    void getEngine().newGame();
  }, [start, scenario]);

  if (import.meta.env.DEV) {
    (window as unknown as { __mindboard: unknown }).__mindboard = { game, fen, yourTurn, thinking: s.thinking, studying, peeking };
  }

  return {
    s,
    dispatch,
    progress,
    fen,
    fenPieces,
    peeking,
    yourTurn,
    elo,
    orientation,
    studyPassed,
    handle,
    peekStart,
    peekEnd,
    finishStudy,
    restart,
  } as const;
}
