// Everything the game screen tracks besides the rules: what you've typed,
// messages, peeking, the engine's status and study evaluations. One reducer
// so the screen's state changes in one place and can be unit tested.

import type { Rng } from '../drills/queue';
import {
  type GameState,
  type PlayerMoveResult,
  answerRecall,
  canPeek,
  engineMove,
  fenOf,
  resign,
  spendPeekTime,
  takeBack,
} from './fogGame';

export interface Message {
  tone: 'warn' | 'info';
  text: string;
}

export interface ScreenState {
  game: GameState;
  /** Study and continue: still looking at the position before the pieces hide. */
  studying: boolean;
  input: string;
  message: Message | null;
  ambiguous: { san: string; uci: string }[] | null;
  /** performance.now() when the peek started; null when not peeking. */
  peekSince: number | null;
  thinking: boolean;
  engineError: string | null;
  recallFeedback: { correct: boolean; text: string; next: GameState } | null;
  /** Study "hold the position" goals: evaluations at the start and end, from your side. */
  evals: { start: number | null; end: number | null };
}

export type ScreenAction =
  | { type: 'restart'; game: GameState; studying: boolean }
  | { type: 'input'; text: string }
  | { type: 'moveResult'; result: PlayerMoveResult }
  | { type: 'engineThinking'; on: boolean }
  | { type: 'engineMoved'; fen: string; uci: string }
  | { type: 'engineError'; error: string }
  | { type: 'peekStart'; at: number }
  | { type: 'peekEnd'; at: number }
  | { type: 'peekSpend'; ms: number }
  | { type: 'finishStudy' }
  | { type: 'evalStart'; cp: number }
  | { type: 'evalEnd'; cp: number }
  | { type: 'takeBack' }
  | { type: 'resign' }
  | { type: 'recallAnswer'; square: string }
  | { type: 'recallDone' }
  | { type: 'message'; message: Message | null };

export function initialScreen(game: GameState, studying: boolean): ScreenState {
  return {
    game,
    studying,
    input: '',
    message: null,
    ambiguous: null,
    peekSince: null,
    thinking: false,
    engineError: null,
    recallFeedback: null,
    evals: { start: null, end: null },
  };
}

export function makeScreenReducer(rng: Rng) {
  return function screenReducer(s: ScreenState, a: ScreenAction): ScreenState {
    switch (a.type) {
      case 'restart':
        return initialScreen(a.game, a.studying);
      case 'input':
        return { ...s, input: a.text.replace(/\s/g, '') };
      case 'moveResult': {
        const r = a.result;
        switch (r.kind) {
          case 'played':
            return { ...s, game: r.state, input: '', message: null, ambiguous: null };
          case 'ambiguous':
            return { ...s, ambiguous: r.options, message: { tone: 'info', text: 'Which one did you mean?' } };
          case 'slip':
            return { ...s, game: r.state, ambiguous: null, message: { tone: 'warn', text: r.message } };
          case 'unreadable':
            return { ...s, ambiguous: null, message: { tone: 'info', text: r.message } };
        }
        return s;
      }
      case 'engineThinking':
        return { ...s, thinking: a.on };
      case 'engineMoved':
        // Ignore a reply to a position that's gone (take-back or restart while it thought).
        return fenOf(s.game) === a.fen ? { ...s, game: engineMove(s.game, a.uci, rng), engineError: null } : s;
      case 'engineError':
        return { ...s, engineError: a.error, thinking: false };
      case 'peekStart':
        if (s.peekSince !== null || s.studying || s.game.result || !canPeek(s.game)) return s;
        return { ...s, peekSince: a.at };
      case 'peekEnd':
        if (s.peekSince === null) return s;
        return { ...s, peekSince: null, game: spendPeekTime(s.game, a.at - s.peekSince) };
      case 'peekSpend':
        return canPeek(s.game) ? { ...s, game: spendPeekTime(s.game, a.ms) } : s;
      case 'finishStudy':
        return { ...s, studying: false };
      case 'evalStart':
        return { ...s, evals: { start: a.cp, end: null } };
      case 'evalEnd':
        return { ...s, evals: { ...s.evals, end: a.cp } };
      case 'takeBack': {
        const t = takeBack(s.game);
        if (!t) return s;
        return { ...s, game: t, ambiguous: null, message: { tone: 'info', text: 'Took back your last move.' } };
      }
      case 'resign':
        return { ...s, game: resign(s.game), peekSince: null };
      case 'recallAnswer': {
        const rc = s.game.pendingRecall;
        if (!rc || s.recallFeedback) return s;
        const r = answerRecall(s.game, a.square as never, rng);
        const text = r.correct ? `${a.square} — right.` : `It was ${rc.answers.join(' or ')}.`;
        return { ...s, recallFeedback: { correct: r.correct, text, next: r.state } };
      }
      case 'recallDone': {
        if (!s.recallFeedback) return s;
        const next = s.recallFeedback.next;
        const message: Message | null = next.droppedTo
          ? { tone: 'warn', text: `Two recall misses in a row: dropped back to ${next.droppedTo} for the rest of this game.` }
          : s.message;
        return { ...s, game: next, recallFeedback: null, message };
      }
      case 'message':
        return { ...s, message: a.message };
    }
  };
}
