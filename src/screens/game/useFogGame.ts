// The game screen's side effects around the pure screen reducer: the engine
// loop, study evaluations, saving the result, and the peek timer/Space key.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { parsePlacement } from '../../board/squares';
import type { StudyPosition } from '../../chess/positions';
import { getEngine, onEngineLoad } from '../../engine/engine';
import { type GameState, type PlayerMoveResult, type Slip, fenOf, replay, gamePasses, newGame, turnOf } from '../../game/fogGame';
import { povCp } from '../../game/review';
import { moveToWords } from '../../chess/spoken';
import { Speaker } from '../../voice/recogniser';
import { MISCLICK_GRACE_MS, initialScreen, makeScreenReducer } from '../../game/screenState';
import type { GameLevel } from '../../levels/games';
import { effectiveElo, engineOffset, withGame, withLostTrack, withStudy } from '../../progress/progress';
import { useProgress } from '../../progress/store';

const MIN_ENGINE_MS = 600;
/**
 * Study positions pass if you lose no more than this much of the evaluation
 * (centipawns). Wide enough that engine noise at this depth doesn't decide it.
 */
export const STUDY_TOLERANCE = 200;
/** Ending clearly better than this always passes, whatever the start was. */
export const STUDY_WINNING = 300;
const STUDY_EVAL_DEPTH = 14;
export const STUDY_MAX_SLIPS = 1;
const reducer = makeScreenReducer(Math.random);
/** With recall checks switched on, fog levels pause every few of your moves to ask where a piece is. */
const RECALL_EVERY: [number, number] = [5, 8];

/** The level as played: recall checks added when you've switched them on. */
export function withRecallPref(level: GameLevel, recallChecks: boolean): GameLevel {
  if (!recallChecks || level.recallEvery || level.hide.kind === 'none') return level;
  return { ...level, recallEvery: RECALL_EVERY };
}

/** Engine load state for the player row: null once ready, else a 0–1 fraction (or null fraction if unknown). */
function useEngineLoading(): { loading: boolean; fraction: number | null } {
  const [ready, setReady] = useState(() => getEngine().ready);
  const [fraction, setFraction] = useState<number | null>(null);
  useEffect(() => {
    if (ready) return;
    let live = true;
    const off = onEngineLoad((f) => live && setFraction(f));
    getEngine()
      .whenReady()
      .then(() => live && setReady(true))
      .catch(() => undefined);
    return () => {
      live = false;
      off();
    };
  }, [ready]);
  return { loading: !ready, fraction };
}

export function useFogGame(level: GameLevel, scenario?: StudyPosition) {
  const { progress, update } = useProgress();
  const engineLoad = useEngineLoading();
  const recallOn = progress?.prefs.recallChecks ?? false;
  const start = useCallback(
    () =>
      newGame(
        withRecallPref(level, recallOn),
        Math.random,
        scenario ? { startFen: scenario.fen, goal: scenario.goal } : {},
      ),
    [level, scenario, recallOn],
  );
  const [s, dispatch] = useReducer(reducer, undefined, () => initialScreen(start(), !!scenario));
  const { game, studying, peekSince } = s;
  const recorded = useRef(false);
  const graceRef = useRef<Slip | undefined>(undefined);

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
    const held = s.evals.end - s.evals.start >= -STUDY_TOLERANCE || s.evals.end >= STUDY_WINNING;
    return held && game.slips.length <= STUDY_MAX_SLIPS;
  })();
  const needEndEval = !!scenario && !!game.result && game.goalMet === null && s.evals.end === null;
  useEffect(() => {
    if (!needEndEval) return;
    getEngine()
      .evaluate(fen, STUDY_EVAL_DEPTH)
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
    (r: PlayerMoveResult, source: 'board' | 'typed' | 'voice' = 'typed') => {
      dispatch({ type: 'moveResult', result: r, source });
      // Slips are kept as lost-track stats (apart from square naming). Board slips wait out the misclick grace.
      const sq = r.kind === 'slip' ? r.state.slips.at(-1)?.square : undefined;
      if (sq && source !== 'board') update((p) => withLostTrack(p, orientation, sq));
      // Moving on while a slip is still in its grace period settles it as real.
      const pending = graceRef.current;
      if (pending?.square) update((p) => withLostTrack(p, orientation, pending.square!));
      graceRef.current = undefined;
      return r;
    },
    [update, orientation],
  );

  // A board slip not waved off as a misclick in time becomes a real one.
  const graceSlip = s.grace ? game.slips[s.grace.slipIndex] : undefined;
  useEffect(() => {
    graceRef.current = graceSlip;
    if (!graceSlip) return;
    const t = setTimeout(() => {
      graceRef.current = undefined;
      dispatch({ type: 'graceOver' });
      if (graceSlip.square) update((p) => withLostTrack(p, orientation, graceSlip.square!));
    }, MISCLICK_GRACE_MS);
    return () => clearTimeout(t);
  }, [graceSlip, update, orientation]);

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
        .evaluate(fen, STUDY_EVAL_DEPTH)
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
    engineLoad,
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

/** Speak the opponent's moves as they arrive. */
export function useEarsOnlyReplies(on: boolean, game: GameState) {
  const speaker = useRef<Speaker | null>(null);
  const count = game.moves.length;
  useEffect(() => {
    const last = game.moves.at(-1);
    if (!on || !last || last.color === game.color) return;
    speaker.current ??= new Speaker();
    const verbose = replay(game.startFen, game.moves).history({ verbose: true }).at(-1);
    if (verbose) void speaker.current.speak(`${last.color === 'w' ? 'White' : 'Black'}: ${moveToWords(verbose)}`);
    // Only when a new move arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, count]);
  useEffect(() => () => speaker.current?.cancel(), []);
}
