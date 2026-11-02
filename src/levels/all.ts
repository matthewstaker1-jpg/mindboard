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

export function levelHref(l: AnyLevel): string {
  return isGameLevel(l) ? `#/game/${l.id}` : `#/drill/${l.id}`;
}
