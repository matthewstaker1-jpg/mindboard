// One run through a level: question order, re-queued misses, in-a-row
// streak and the summary used to decide a pass. Pure state transitions.

import type { Square } from '../board/squares';
import type { LevelDef, SessionSummary } from '../levels/ladder';
import { median, type StatsTable } from '../progress/stats';
import { type Question, checkAnswer, generateQuestion, repeatQuestion } from './questions';
import { type Rng, retryGap } from './queue';

export interface AnswerRecord {
  question: Question;
  given: string;
  correct: boolean;
  ms: number;
}

export interface SessionState {
  level: LevelDef;
  answers: AnswerRecord[];
  /** Missed questions waiting to come back, keyed by the answer count they're due at. */
  retries: { due: number; question: Question }[];
  /** Correct answers in a row right now. */
  run: number;
}

export function newSession(level: LevelDef): SessionState {
  return { level, answers: [], retries: [], run: 0 };
}

export function isFinished(s: SessionState): boolean {
  return s.answers.length >= s.level.questions;
}

function recentSquares(s: SessionState): Square[] {
  return s.answers.slice(-4).map((a) => a.question.statSquare);
}

export function nextQuestion(s: SessionState, stats: StatsTable, rng: Rng): { session: SessionState; question: Question } {
  const asked = s.answers.length;
  const dueIdx = s.retries.findIndex((r) => r.due <= asked);
  if (dueIdx >= 0) {
    const question = repeatQuestion(s.retries[dueIdx]!.question);
    return { session: { ...s, retries: s.retries.filter((_, i) => i !== dueIdx) }, question };
  }
  return { session: s, question: generateQuestion({ level: s.level, stats, recent: recentSquares(s), rng }) };
}

export function submitAnswer(
  s: SessionState,
  question: Question,
  given: string,
  ms: number,
  rng: Rng,
): { session: SessionState; correct: boolean } {
  const correct = checkAnswer(question, given);
  const answers = [...s.answers, { question, given, correct, ms }];
  const retries = correct ? s.retries : [...s.retries, { due: answers.length + retryGap(rng) - 1, question }];
  return { session: { ...s, answers, retries, run: correct ? s.run + 1 : 0 }, correct };
}

export function summarise(s: SessionState): SessionSummary {
  return {
    correct: s.answers.filter((a) => a.correct).length,
    total: s.answers.length,
    medianMs: median(s.answers.map((a) => a.ms)),
  };
}
