// Stage 3–4 game levels: engine games where the board fades. Data, not code.

export type HideRule =
  | { kind: 'none' }
  /** `count` of your non-pawn pieces made invisible, chosen at random at the start. */
  | { kind: 'fog'; count: number }
  /** Everything starts visible; each of your pieces vanishes once it has moved. */
  | { kind: 'moved' }
  /** All your pawns gone. */
  | { kind: 'own-pawns' }
  /** All your pieces gone; theirs stay lit. */
  | { kind: 'own-all' }
  /** Every piece gone. */
  | { kind: 'all' };

/**
 * board: normal board. dark: dark board with only the last move lit.
 * list: no board, move list only. none: no board, no list, just the last move.
 */
export type GameView = 'board' | 'dark' | 'list' | 'none';

export interface GameLevel {
  id: string;
  mode: 'game';
  stage: 3 | 4;
  title: string;
  blurb: string;
  engineElo: number;
  side: 'white' | 'random';
  hide: HideRule;
  view: GameView;
  showMoveList: boolean;
  /** Total milliseconds you can hold the board visible per game; null is unlimited. */
  peekBudgetMs: number | null;
  /**
   * A recall check pauses the game every this-many of your moves (random in
   * range). Null means none: they're off on every level for now because the
   * pause broke the flow of play.
   */
  recallEvery: [number, number] | null;
  /** Passed once `need` of your last `of` games count (not lost, at most `maxSlips` slips). */
  pass: { result: 'not-loss'; maxSlips: number; need: number; of: number };
}

const PASS = { result: 'not-loss', maxSlips: 3, need: 2, of: 3 } as const;

export const GAME_LEVELS: GameLevel[] = [
  {
    id: 'fade-moved',
    mode: 'game',
    stage: 3,
    title: 'Fade as they move',
    blurb: 'Every piece starts visible. Each of yours vanishes once it has moved.',
    engineElo: 800,
    side: 'white',
    hide: { kind: 'moved' },
    view: 'board',
    showMoveList: true,
    peekBudgetMs: null,
    recallEvery: null,
    pass: PASS,
  },
  {
    id: 'fog-2',
    mode: 'game',
    stage: 3,
    title: 'Fog · 2 pieces',
    blurb: 'Two of your pieces vanish. Remember which ones, and where they go.',
    engineElo: 800,
    side: 'white',
    hide: { kind: 'fog', count: 2 },
    view: 'board',
    showMoveList: true,
    peekBudgetMs: null,
    recallEvery: null,
    pass: PASS,
  },
  {
    id: 'fog-4',
    mode: 'game',
    stage: 3,
    title: 'Fog · 4 pieces',
    blurb: 'Four of your pieces vanish each game. Keep them in your head.',
    engineElo: 900,
    side: 'random',
    hide: { kind: 'fog', count: 4 },
    view: 'board',
    showMoveList: true,
    peekBudgetMs: null,
    recallEvery: null,
    pass: PASS,
  },
  {
    id: 'fog-6',
    mode: 'game',
    stage: 3,
    title: 'Fog · 6 pieces',
    blurb: 'Six of your pieces in the fog.',
    engineElo: 1000,
    side: 'random',
    hide: { kind: 'fog', count: 6 },
    view: 'board',
    showMoveList: true,
    peekBudgetMs: 30_000,
    recallEvery: null,
    pass: PASS,
  },
  {
    id: 'pawnless',
    mode: 'game',
    stage: 3,
    title: 'Pawnless',
    blurb: 'Your pawns are gone from view. Pieces stay.',
    engineElo: 1000,
    side: 'random',
    hide: { kind: 'own-pawns' },
    view: 'board',
    showMoveList: true,
    peekBudgetMs: 30_000,
    recallEvery: null,
    pass: PASS,
  },
  {
    id: 'ghost-army',
    mode: 'game',
    stage: 3,
    title: 'Ghost army',
    blurb: 'All of your pieces are invisible. Theirs stay lit.',
    engineElo: 1100,
    side: 'random',
    hide: { kind: 'own-all' },
    view: 'board',
    showMoveList: true,
    peekBudgetMs: 20_000,
    recallEvery: null,
    pass: PASS,
  },
  {
    id: 'dark-board',
    mode: 'game',
    stage: 3,
    title: 'Dark board',
    blurb: 'Every piece is gone. Only the last move lights up.',
    engineElo: 1200,
    side: 'random',
    hide: { kind: 'all' },
    view: 'dark',
    showMoveList: false,
    peekBudgetMs: 15_000,
    recallEvery: null,
    pass: PASS,
  },
  {
    id: 'list-only',
    mode: 'game',
    stage: 4,
    title: 'Move list only',
    blurb: 'No board at all. Just the moves.',
    engineElo: 1200,
    side: 'random',
    hide: { kind: 'all' },
    view: 'list',
    showMoveList: true,
    peekBudgetMs: 15_000,
    recallEvery: null,
    pass: PASS,
  },
  {
    id: 'blindfold',
    mode: 'game',
    stage: 4,
    title: 'Full blindfold',
    blurb: 'No board, no move list. Only the last move.',
    engineElo: 1300,
    side: 'random',
    hide: { kind: 'all' },
    view: 'none',
    showMoveList: false,
    peekBudgetMs: 10_000,
    recallEvery: null,
    pass: PASS,
  },
];

export function gameLevelById(id: string): GameLevel | undefined {
  return GAME_LEVELS.find((l) => l.id === id);
}

/** The level one step easier, for dropping back mid-game. Null below the first. */
export function easierLevel(id: string): GameLevel | null {
  const i = GAME_LEVELS.findIndex((l) => l.id === id);
  return i > 0 ? GAME_LEVELS[i - 1]! : null;
}

/** The settings a study position is played under: how much fades once you're ready. */
export function studyLevel(hide: 'moved' | 'own-all' | 'all'): GameLevel {
  return {
    id: `study-${hide}`,
    mode: 'game',
    stage: 3,
    title: hide === 'all' ? 'Study · everything hidden' : hide === 'moved' ? 'Study · fade as they move' : 'Study · your pieces hidden',
    blurb: 'Study a position, then play on with it hidden.',
    engineElo: 1000,
    side: 'white',
    hide: hide === 'all' ? { kind: 'all' } : hide === 'moved' ? { kind: 'moved' } : { kind: 'own-all' },
    view: hide === 'all' ? 'dark' : 'board',
    showMoveList: true,
    peekBudgetMs: 20_000,
    recallEvery: null,
    pass: PASS,
  };
}
