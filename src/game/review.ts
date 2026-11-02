// The quiet part of the blunder guard: after the game, find the few moves
// that cost the most. Nothing here interrupts play.

import type { Score } from '../engine/engine';
import type { Color, PlayedMove } from './fogGame';

const MATE_CP = 10_000;

/** An engine score (side to move's view) as centipawns from the player's view. */
export function povCp(score: Score, sideToMove: Color, player: Color): number {
  const cp = score.mate != null ? (score.mate > 0 ? MATE_CP : -MATE_CP) : (score.cp ?? 0);
  return sideToMove === player ? cp : -cp;
}

export interface Mistake {
  ply: number;
  move: PlayedMove;
  /** Centipawns lost from your point of view. */
  drop: number;
  before: number;
  after: number;
}

/**
 * `evals[i]` is the position before ply i, from your point of view, so it has
 * moves.length + 1 entries. Returns your worst moves, worst first.
 */
export function biggestMistakes(moves: PlayedMove[], evals: number[], player: Color, threshold = 200, limit = 2): Mistake[] {
  const out: Mistake[] = [];
  moves.forEach((move, ply) => {
    if (move.color !== player || evals[ply] == null || evals[ply + 1] == null) return;
    const before = evals[ply]!;
    const after = evals[ply + 1]!;
    // Already-lost positions don't count: there's nothing left to blunder.
    if (before <= -500) return;
    const drop = before - after;
    if (drop >= threshold) out.push({ ply, move, drop, before, after });
  });
  return out.sort((a, b) => b.drop - a.drop).slice(0, limit);
}

export function formatEval(cp: number): string {
  if (Math.abs(cp) >= MATE_CP) return cp > 0 ? 'mate' : 'mated';
  const v = cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}
