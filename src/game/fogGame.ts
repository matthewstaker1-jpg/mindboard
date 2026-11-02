// Rules for a fog game: what's hidden, recall checks, peeks, slips and the
// mid-game drop back. Pure state transitions over chess.js; the screen and
// the engine live elsewhere.

import { Chess, type Move } from 'chess.js';
import type { HiddenMode } from '../board/Board';
import { FILES, type Piece, type Square, isLightSquare, isWhitePiece } from '../board/squares';
import { PIECE_NAME } from '../chess/game';
import { parseMove } from '../chess/san';
import type { Rng } from '../drills/queue';
import { type GameLevel, type HideRule, easierLevel } from '../levels/games';

export type Color = 'w' | 'b';

export interface PlayedMove {
  san: string;
  from: Square;
  to: Square;
  color: Color;
  moveNumber: number;
}

export interface Slip {
  moveNumber: number;
  kind: 'illegal' | 'recall';
  text: string;
  square?: Square;
}

export interface Recall {
  prompt: string;
  /** Four squares to choose from. */
  options: Square[];
  /** Squares that count as right (one of them is among the options). */
  answers: Square[];
}

export interface GameResult {
  outcome: 'win' | 'draw' | 'loss';
  reason: string;
}

export interface GameState {
  level: GameLevel;
  /** The level whose hiding is in force: `level`, or an easier one after a drop back. */
  shownAs: GameLevel;
  color: Color;
  moves: PlayedMove[];
  /** Your squares in the fog (fog rule only); they follow the pieces. */
  fogSquares: Square[];
  peeksLeft: number;
  slips: Slip[];
  ownMoves: number;
  nextRecallAt: number;
  recallMissRun: number;
  recalls: { asked: number; correct: number };
  pendingRecall: Recall | null;
  /** Set when a drop back just happened, for the screen to announce. */
  droppedTo: string | null;
  result: GameResult | null;
}

export function replay(moves: PlayedMove[]): Chess {
  const c = new Chess();
  for (const m of moves) c.move(m.san);
  return c;
}

export function fenOf(s: GameState): string {
  return replay(s.moves).fen();
}

export function turnOf(s: GameState): Color {
  return s.moves.length % 2 === 0 ? 'w' : 'b';
}

function between(rng: Rng, [lo, hi]: [number, number]): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function ownSquares(chess: Chess, color: Color, filter: (type: string) => boolean): Square[] {
  const out: Square[] = [];
  for (const row of chess.board()) for (const c of row) if (c && c.color === color && filter(c.type)) out.push(c.square as Square);
  return out;
}

/** Pick `count` of your non-pawn, non-king pieces to fog. */
export function pickFogSquares(chess: Chess, color: Color, count: number, rng: Rng): Square[] {
  const pool = ownSquares(chess, color, (t) => t !== 'p' && t !== 'k');
  return shuffle(pool, rng).slice(0, count);
}

/** Move fogged squares along with their pieces; drop any that get captured. */
export function trackFog(squares: Square[], m: Move): Square[] {
  let out = squares.filter((s) => s !== m.to); // captured on its square
  if (m.isEnPassant()) out = out.filter((s) => s !== `${m.to[0]}${m.from[1]}`);
  out = out.map((s) => (s === m.from ? (m.to as Square) : s));
  if (m.isKingsideCastle() || m.isQueensideCastle()) {
    const r = m.from[1];
    const [rf, rt] = m.isKingsideCastle() ? [`h${r}`, `f${r}`] : [`a${r}`, `d${r}`];
    out = out.map((s) => (s === rf ? (rt as Square) : s));
  }
  return out;
}

/** What the board should do with the piece on `sq` under a hide rule. */
export function hiddenMode(rule: HideRule, color: Color, fog: Square[], sq: Square, piece: Piece): HiddenMode {
  const mine = isWhitePiece(piece) === (color === 'w');
  switch (rule.kind) {
    case 'none':
      return 'show';
    case 'fog':
      return mine && fog.includes(sq) ? 'ghost' : 'show';
    case 'own-pawns':
      return mine && piece.toLowerCase() === 'p' ? 'gone' : 'show';
    case 'own-all':
      return mine ? 'gone' : 'show';
    case 'all':
      return 'gone';
  }
}

function isHiddenFromYou(s: GameState, chess: Chess, sq: Square): boolean {
  const p = chess.get(sq);
  if (!p) return false;
  const piece = (p.color === 'w' ? p.type.toUpperCase() : p.type) as Piece;
  return hiddenMode(s.shownAs.hide, s.color, s.fogSquares, sq, piece) !== 'show';
}

export function newGame(level: GameLevel, rng: Rng, color?: Color): GameState {
  const c = color ?? (level.side === 'white' ? 'w' : rng() < 0.5 ? 'w' : 'b');
  const chess = new Chess();
  return {
    level,
    shownAs: level,
    color: c,
    moves: [],
    fogSquares: level.hide.kind === 'fog' ? pickFogSquares(chess, c, level.hide.count, rng) : [],
    peeksLeft: level.peeks,
    slips: [],
    ownMoves: 0,
    nextRecallAt: level.recallEvery ? between(rng, level.recallEvery) : Infinity,
    recallMissRun: 0,
    recalls: { asked: 0, correct: 0 },
    pendingRecall: null,
    droppedTo: null,
    result: null,
  };
}

function resultAfter(chess: Chess, you: Color): GameResult | null {
  if (chess.isCheckmate()) {
    const loser = chess.turn();
    return loser === you ? { outcome: 'loss', reason: 'Checkmate' } : { outcome: 'win', reason: 'Checkmate' };
  }
  if (chess.isStalemate()) return { outcome: 'draw', reason: 'Stalemate' };
  if (chess.isInsufficientMaterial()) return { outcome: 'draw', reason: 'Insufficient material' };
  if (chess.isThreefoldRepetition()) return { outcome: 'draw', reason: 'Threefold repetition' };
  if (chess.isDraw()) return { outcome: 'draw', reason: 'Fifty-move rule' };
  return null;
}

/** Apply a legal move (either side). Returns null if it isn't legal. */
function play(s: GameState, input: string | { from: string; to: string; promotion?: string }): GameState | null {
  const chess = replay(s.moves);
  const moveNumber = chess.moveNumber();
  let m: Move;
  try {
    m = chess.move(input);
  } catch {
    return null;
  }
  const played: PlayedMove = { san: m.san, from: m.from as Square, to: m.to as Square, color: m.color, moveNumber };
  const mine = m.color === s.color;
  return {
    ...s,
    moves: [...s.moves, played],
    fogSquares: trackFog(s.fogSquares, m),
    ownMoves: s.ownMoves + (mine ? 1 : 0),
    droppedTo: null,
    result: resultAfter(chess, s.color),
  };
}

export type PlayerMoveResult =
  | { kind: 'played'; state: GameState }
  | { kind: 'ambiguous'; options: { san: string; uci: string }[] }
  | { kind: 'slip'; state: GameState; message: string }
  | { kind: 'unreadable'; message: string };

function slip(s: GameState, text: string, square?: Square): GameState {
  return { ...s, slips: [...s.slips, { moveNumber: replay(s.moves).moveNumber(), kind: 'illegal', text, square }] };
}

/** A typed move: "nf3", "g1f3", "0-0" and so on. */
export function playerMoveTyped(s: GameState, text: string): PlayerMoveResult {
  if (s.result || s.pendingRecall || turnOf(s) !== s.color) return { kind: 'unreadable', message: "It isn't your move." };
  const r = parseMove(text, fenOf(s));
  switch (r.kind) {
    case 'ok':
      return { kind: 'played', state: play(s, r.move.lan)! };
    case 'ambiguous':
      return { kind: 'ambiguous', options: r.options.map((m) => ({ san: m.san, uci: m.lan })) };
    case 'unreadable':
      return { kind: 'unreadable', message: `Couldn't read "${r.input}". Try Nf3, exd5, g1f3 or O-O.` };
    case 'illegal':
      return { kind: 'slip', state: slip(s, `${r.input} isn't legal here`), message: `${r.input} isn't a legal move here.` };
  }
}

/** A move made on the board: from one square to another (promotions default to a queen). */
export function playerMoveSquares(s: GameState, from: Square, to: Square): PlayerMoveResult {
  if (s.result || s.pendingRecall || turnOf(s) !== s.color) return { kind: 'unreadable', message: "It isn't your move." };
  const chess = replay(s.moves);
  const p = chess.get(from);
  if (!p || p.color !== s.color) {
    return { kind: 'slip', state: slip(s, `No piece of yours on ${from}`, from), message: `None of your pieces is on ${from}.` };
  }
  const legal = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
  const m = legal.find((x) => !x.promotion || x.promotion === 'q');
  if (!m) {
    const name = PIECE_NAME[p.type];
    return {
      kind: 'slip',
      state: slip(s, `${name} ${from}–${to} isn't legal`, from),
      message: `Your ${name} on ${from} can't go to ${to}.`,
    };
  }
  return { kind: 'played', state: play(s, m.lan)! };
}

/** The engine's reply, in UCI ("e7e5", "e7e8q"). Also schedules a recall check when one is due. */
export function engineMove(s: GameState, uci: string, rng: Rng): GameState {
  const next = play(s, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  if (!next) throw new Error(`Engine played an illegal move: ${uci}`);
  const every = next.level.recallEvery;
  if (every && !next.result && next.ownMoves >= next.nextRecallAt) {
    const recall = makeRecall(next, rng);
    if (recall) return { ...next, pendingRecall: recall, nextRecallAt: next.ownMoves + between(rng, every) };
  }
  return next;
}

function pieceWord(type: string, sq: Square, count: number): string {
  if (type === 'b') return `${isLightSquare(sq) ? 'light' : 'dark'}-squared bishop`;
  return count > 1 ? `one of your ${PIECE_NAME[type]}s` : PIECE_NAME[type]!;
}

/** "Where is your light-squared bishop?" — about a piece you can't see. */
export function makeRecall(s: GameState, rng: Rng): Recall | null {
  const chess = replay(s.moves);
  const hidden = ownSquares(chess, s.color, () => true).filter((sq) => isHiddenFromYou(s, chess, sq));
  // Prefer pieces over pawns: there are fewer, so the question is sharper.
  const pieces = hidden.filter((sq) => chess.get(sq)!.type !== 'p');
  const pool = pieces.length ? pieces : hidden;
  if (pool.length === 0) return null;
  const sq = pool[Math.floor(rng() * pool.length)]!;
  const type = chess.get(sq)!.type;
  const same = ownSquares(chess, s.color, (t) => t === type);
  // Bishops are named by square colour, so only the one bishop answers.
  const answers = type === 'b' ? [sq] : same;
  const word = type === 'b' ? pieceWord(type, sq, 1) : pieceWord(type, sq, same.length);
  const prompt = word.startsWith('one of') ? `Where is ${word}?` : `Where is your ${word}?`;

  // Wrong options: nearby squares without a matching piece; same colour for bishops.
  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]);
  const near: Square[] = [];
  for (let df = -2; df <= 2; df++)
    for (let dr = -2; dr <= 2; dr++) {
      const nf = f + df;
      const nr = r + dr;
      if (nf < 0 || nf > 7 || nr < 1 || nr > 8 || (df === 0 && dr === 0)) continue;
      const cand = `${FILES[nf]}${nr}` as Square;
      if (answers.includes(cand) || same.includes(cand)) continue;
      if (type === 'b' && isLightSquare(cand) !== isLightSquare(sq)) continue;
      near.push(cand);
    }
  const wrong = shuffle(near, rng).slice(0, 3);
  return { prompt, options: shuffle([sq, ...wrong], rng), answers };
}

/** Answer the pending recall check. Two misses in a row drop the fog back a level for this game. */
export function answerRecall(s: GameState, sq: Square, rng: Rng): { state: GameState; correct: boolean } {
  const rc = s.pendingRecall;
  if (!rc) return { state: s, correct: false };
  const correct = rc.answers.includes(sq);
  const missRun = correct ? 0 : s.recallMissRun + 1;
  let next: GameState = {
    ...s,
    pendingRecall: null,
    recallMissRun: missRun,
    recalls: { asked: s.recalls.asked + 1, correct: s.recalls.correct + (correct ? 1 : 0) },
    slips: correct
      ? s.slips
      : [...s.slips, { moveNumber: replay(s.moves).moveNumber(), kind: 'recall', text: `${rc.prompt} — it was ${rc.answers.join(' or ')}`, square: rc.answers[0] }],
  };
  if (missRun >= 2) {
    const easier = easierLevel(s.shownAs.id);
    const target: GameLevel = easier ?? { ...s.shownAs, id: 'none', title: 'No fog', hide: { kind: 'none' }, view: 'board', showMoveList: true };
    const chess = replay(s.moves);
    next = {
      ...next,
      shownAs: target,
      recallMissRun: 0,
      droppedTo: target.title,
      fogSquares: target.hide.kind === 'fog' ? pickFogSquares(chess, s.color, target.hide.count, rng) : [],
    };
  }
  return { state: next, correct };
}

export function spendPeek(s: GameState): GameState | null {
  return s.peeksLeft > 0 ? { ...s, peeksLeft: s.peeksLeft - 1 } : null;
}

export function resign(s: GameState): GameState {
  return s.result ? s : { ...s, result: { outcome: 'loss', reason: 'Resigned' }, pendingRecall: null };
}

/** Does this finished game count towards passing its level? */
export function gamePasses(s: GameState): boolean {
  if (!s.result) return false;
  return s.result.outcome !== 'loss' && s.slips.length <= s.level.pass.maxSlips && s.shownAs.id === s.level.id;
}
