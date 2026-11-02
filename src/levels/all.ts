// The whole ladder in order: Stage 1–2 drills, then Stage 3–4 games.

import { GAME_LEVELS, type GameLevel } from './games';
import { LADDER, type LevelDef, STAGE_NAMES as DRILL_STAGES } from './ladder';

export type AnyLevel = LevelDef | GameLevel;

export const ALL_LEVELS: AnyLevel[] = [...LADDER, ...GAME_LEVELS];

export const STAGE_NAMES: Record<number, string> = {
  ...DRILL_STAGES,
  3: 'Fade the board',
  4: 'Full blindfold',
};

export function isGameLevel(l: AnyLevel): l is GameLevel {
  return 'mode' in l && l.mode === 'game';
}

/** Where a level sits within its own stage: "2 of 7". Numbering restarts each stage. */
export function stagePosition(id: string): { index: number; count: number } | null {
  const l = ALL_LEVELS.find((x) => x.id === id);
  if (!l) return null;
  const same = ALL_LEVELS.filter((x) => x.stage === l.stage);
  return { index: same.indexOf(l) + 1, count: same.length };
}

export function levelHref(l: AnyLevel): string {
  return isGameLevel(l) ? `#/game/${l.id}` : `#/drill/${l.id}`;
}
