// Rules for a fog game: what's hidden, peeks, slips, lost-track detection,
// short goals for study positions, and recall checks (off by default).
// Pure state transitions over chess.js; the screen and the engine live
// elsewhere.

import { Chess, type Move } from 'chess.js';
import type { HiddenMode } from '../board/Board';
import { FILES, type Piece, type Square, isLightSquare, isWhitePiece } from '../board/squares';
import { PIECE_NAME } from '../chess/game';
import { parseMove } from '../chess/san';
import type { Rng } from '../drills/queue';
import { type GameLevel, type HideRule, easierLevel } from '../levels/games';

export type Color = 'w' | 'b';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface PlayedMove {
  san: string;
  from: Square;
  to: Square;
  color: Color;
  moveNumber: number;
}

export interface Slip {
  moveNumber: number;
  kind: 'illegal' | 'lost-track' | 'recall' | 'take-back';
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

/** A short target for study positions instead of a whole game. */
export type Goal =
  | { kind: 'moves'; n: number }
  | { kind: 'mate'; within: number }
  | { kind: 'promote'; within: number };

export interface GameResult {
  /** 'done' ends a study position (its goal reached or its moves used up). */
  outcome: 'win' | 'draw' | 'loss' | 'done';
  reason: string;
}

export interface GameState {
  level: GameLevel;
  /** The level whose hiding is in force: `level`, or an easier one after a drop back. */
  shownAs: GameLevel;
  color: Color;
  startFen: string;
  moves: PlayedMove[];
  /** Fogged squares at the start, so the fog can be recomputed after a take-back. */
  fogStart: Square[];
  /** Your hidden squares under the fog and moved rules; they follow the pieces. */
  fogSquares: Square[];
  /** Milliseconds of peeking left; null is unlimited. */
  peekMsLeft: number | null;
  peekMsUsed: number;
  slips: Slip[];
  /** Take-backs used this game; the first is free. */
  takeBacks: number;
  ownMoves: number;
  nextRecallAt: number;
  recallMissRun: number;
  recalls: { asked: number; correct: number };
  pendingRecall: Recall | null;
  /** Set when a drop back just happened, for the screen to announce. */
  droppedTo: string | null;
  goal: Goal | null;
  /** For mate/promote goals: whether it was met. Null until known (moves goals are judged by the engine). */
  goalMet: boolean | null;
  result: GameResult | null;
}

export function replay(startFen: string, moves: PlayedMove[]): Chess {
  const c = new Chess(startFen);
  for (const m of moves) c.move(m.san);
  return c;
}

const chessOf = (s: GameState) => replay(s.startFen, s.moves);

export function fenOf(s: GameState): string {
  return chessOf(s).fen();
}

export function turnOf(s: GameState): Color {
  const first = s.startFen.split(' ')[1] === 'b' ? 'b' : 'w';
  return s.moves.length % 2 === 0 ? first : first === 'w' ? 'b' : 'w';
}

function lastIndex<T>(xs: T[], pred: (x: T) => boolean): number {
  for (let i = xs.length - 1; i >= 0; i--) if (pred(xs[i]!)) return i;
  return -1;
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

function rookCastleSquares(m: Move): [Square, Square] | null {
  if (!m.isKingsideCastle() && !m.isQueensideCastle()) return null;
  const r = m.from[1];
  return (m.isKingsideCastle() ? [`h${r}`, `f${r}`] : [`a${r}`, `d${r}`]) as [Square, Square];
}

/** Move hidden squares along with their pieces; drop any that get captured. */
export function trackFog(squares: Square[], m: Move): Square[] {
  let out = squares.filter((s) => s !== m.to); // captured on its square
  if (m.isEnPassant()) out = out.filter((s) => s !== `${m.to[0]}${m.from[1]}`);
  out = out.map((s) => (s === m.from ? (m.to as Square) : s));
  const rook = rookCastleSquares(m);
  if (rook) out = out.map((s) => (s === rook[0] ? rook[1] : s));
  return out;
}

/** Hidden squares after a move: tracked, plus (moved rule) whatever of yours just moved. */
function nextFog(rule: HideRule, fog: Square[], m: Move, mine: boolean): Square[] {
  const out = trackFog(fog, m);
  if (rule.kind !== 'moved' || !mine) return out;
  const added = [m.to as Square, ...(rookCastleSquares(m)?.slice(1) ?? [])];
  return [...new Set([...out, ...added])];
}

/** What the board should do with the piece on `sq` under a hide rule. */
export function hiddenMode(rule: HideRule, color: Color, fog: Square[], sq: Square, piece: Piece): HiddenMode {
  const mine = isWhitePiece(piece) === (color === 'w');
  switch (rule.kind) {
    case 'none':
      return 'show';
    case 'fog':
    case 'moved':
      // Gone, not a ring: a ring gives away where the piece is (and, with two knights fogged, what it is).
      return mine && fog.includes(sq) ? 'gone' : 'show';
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

export interface GameOptions {
  color?: Color;
  startFen?: string;
  goal?: Goal;
}

export function newGame(level: GameLevel, rng: Rng, opts: GameOptions | Color = {}): GameState {
  const o: GameOptions = typeof opts === 'string' ? { color: opts } : opts;
  const startFen = o.startFen ?? START_FEN;
  const chess = new Chess(startFen);
  const c = o.color ?? (o.startFen ? chess.turn() : level.side === 'white' ? 'w' : rng() < 0.5 ? 'w' : 'b');
  const fog = level.hide.kind === 'fog' ? pickFogSquares(chess, c, level.hide.count, rng) : [];
  return {
    level,
    shownAs: level,
    color: c,
    startFen,
    moves: [],
    fogStart: fog,
    fogSquares: fog,
    peekMsLeft: level.peekBudgetMs,
    peekMsUsed: 0,
    slips: [],
    takeBacks: 0,
    ownMoves: 0,
    nextRecallAt: level.recallEvery ? between(rng, level.recallEvery) : Infinity,
    recallMissRun: 0,
    recalls: { asked: 0, correct: 0 },
    pendingRecall: null,
    droppedTo: null,
    goal: o.goal ?? null,
    goalMet: null,
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

/** Where a study goal stands after a move. */
function goalAfter(s: GameState, m: Move, mine: boolean, ownMoves: number, result: GameResult | null) {
  const g = s.goal;
  if (!g) return { result, goalMet: s.goalMet };
  if (g.kind === 'mate') {
    if (result?.outcome === 'win') return { result, goalMet: true };
    if (result) return { result, goalMet: false };
    if (mine && ownMoves >= g.within) return { result: { outcome: 'done', reason: `No mate in ${g.within} moves` } as GameResult, goalMet: false };
  }
  if (g.kind === 'promote') {
    if (mine && m.promotion) return { result: { outcome: 'done', reason: 'Promoted' } as GameResult, goalMet: true };
    if (result) return { result, goalMet: false };
    if (mine && ownMoves >= g.within) return { result: { outcome: 'done', reason: `No promotion in ${g.within} moves` } as GameResult, goalMet: false };
  }
  if (g.kind === 'moves') {
    if (result) return { result, goalMet: result.outcome === 'win' ? true : result.outcome === 'loss' ? false : null };
    if (mine && ownMoves >= g.n) return { result: { outcome: 'done', reason: `${g.n} moves played` } as GameResult, goalMet: null };
  }
  return { result, goalMet: s.goalMet };
}

/** Apply a legal move (either side). Returns null if it isn't legal. */
function play(s: GameState, input: string | { from: string; to: string; promotion?: string }): GameState | null {
  const chess = chessOf(s);
  const moveNumber = chess.moveNumber();
  let m: Move;
  try {
    m = chess.move(input);
  } catch {
    return null;
  }
  const played: PlayedMove = { san: m.san, from: m.from as Square, to: m.to as Square, color: m.color, moveNumber };
  const mine = m.color === s.color;
  const ownMoves = s.ownMoves + (mine ? 1 : 0);
  const g = goalAfter(s, m, mine, ownMoves, resultAfter(chess, s.color));
  return {
    ...s,
    moves: [...s.moves, played],
    fogSquares: nextFog(s.shownAs.hide, s.fogSquares, m, mine),
    ownMoves,
    droppedTo: null,
    result: g.result,
    goalMet: g.goalMet,
  };
}

export type PlayerMoveResult =
  | { kind: 'played'; state: GameState }
  | { kind: 'ambiguous'; options: { san: string; uci: string }[] }
  | { kind: 'slip'; state: GameState; message: string }
  | { kind: 'unreadable'; message: string };

function slip(s: GameState, kind: Slip['kind'], text: string, square?: Square): GameState {
  return { ...s, slips: [...s.slips, { moveNumber: chessOf(s).moveNumber(), kind, text, square }] };
}

export interface Trace {
  piece: string;
  /** The move on which it left the square. */
  left: PlayedMove;
  /** Where it is now, or null if it was captured. */
  now: Square | null;
  capturedOn?: number;
}

/** Follow a piece of yours that once stood on `sq` to wherever it is now. */
export function traceFrom(s: GameState, sq: Square): Trace | null {
  const i = lastIndex(s.moves, (m) => m.color === s.color && m.from === sq);
  if (i < 0) return null;
  const left = s.moves[i]!;
  const piece = replay(s.startFen, s.moves.slice(0, i)).get(sq)?.type ?? 'p';
  let cur: Square = left.to;
  for (const m of s.moves.slice(i + 1)) {
    if (m.color === s.color && m.from === cur) cur = m.to;
    else if (m.color !== s.color && m.to === cur) return { piece, left, now: null, capturedOn: m.moveNumber };
  }
  return { piece, left, now: cur };
}

function traceText(t: Trace): string {
  const name = PIECE_NAME[t.piece];
  return t.now
    ? `Your ${name} left ${t.left.from} on move ${t.left.moveNumber}; it's on ${t.now}.`
    : `Your ${name} left ${t.left.from} on move ${t.left.moveNumber} and was captured on move ${t.capturedOn}.`;
}

/**
 * Would this typed move have been legal with one of your pieces back on a
 * square it used to stand on? That's a visualisation slip, not a rules one.
 */
export function lostTrackTyped(s: GameState, text: string): Trace | null {
  const now = chessOf(s);
  const origins = [...new Set(s.moves.filter((m) => m.color === s.color).map((m) => m.from))].reverse();
  for (const origin of origins) {
    if (now.get(origin)) continue;
    const t = traceFrom(s, origin);
    if (!t) continue;
    const hypo = new Chess(now.fen());
    if (t.now) hypo.remove(t.now);
    try {
      if (!hypo.put({ type: t.piece as 'p', color: s.color }, origin)) continue;
    } catch {
      continue;
    }
    const r = parseMove(text, hypo.fen());
    if (r.kind === 'ok' && r.move.from === origin) return t;
  }
  return null;
}

const LINES: Record<string, [number, number][]> = {
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};
const sqAt = (f: number, r: number) => `${FILES[f]}${r}` as Square;

export interface Blocked {
  text: string;
  square: Square;
}

/**
 * Why a typed piece move is illegal, when it's a visualisation problem: your
 * own piece is already on the target, or something stands in the way of a
 * rook, bishop or queen that would otherwise get there.
 */
export function explainBlocked(s: GameState, text: string): Blocked | null {
  const m = text.trim().match(/^([KQRBNkqrbn])?([a-h])?([1-8])?x?([a-h][1-8])/);
  if (!m) return null;
  const type = (m[1] ?? 'p').toLowerCase();
  const to = m[4] as Square;
  const chess = chessOf(s);
  const name = PIECE_NAME[type]!;
  const own = chess.get(to);
  if (own && own.color === s.color) {
    return { text: `Your own ${PIECE_NAME[own.type]} is on ${to}, so your ${name} can't go there.`, square: to };
  }
  const dirs = LINES[type];
  if (!dirs) return null;
  const tf = to.charCodeAt(0) - 97;
  const tr = Number(to[1]);
  for (const from of ownSquares(chess, s.color, (t) => t === type)) {
    if ((m[2] && from[0] !== m[2]) || (m[3] && from[1] !== m[3])) continue;
    const ff = from.charCodeAt(0) - 97;
    const fr = Number(from[1]);
    const df = Math.sign(tf - ff);
    const dr = Math.sign(tr - fr);
    const straight = ff === tf || fr === tr || Math.abs(tf - ff) === Math.abs(tr - fr);
    if (!straight || !dirs.some(([a, b]) => a === df && b === dr)) continue;
    for (let f = ff + df, r = fr + dr; f !== tf || r !== tr; f += df, r += dr) {
      const p = chess.get(sqAt(f, r));
      if (!p) continue;
      const whose = p.color === s.color ? 'your own' : p.color === 'w' ? 'the white' : 'the black';
      return { text: `Your ${name} on ${from} can't reach ${to}: ${whose} ${PIECE_NAME[p.type]} on ${sqAt(f, r)} is in the way.`, square: sqAt(f, r) };
    }
  }
  return null;
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
    case 'illegal': {
      const t = lostTrackTyped(s, text);
      if (t) return { kind: 'slip', state: slip(s, 'lost-track', traceText(t), t.left.from), message: traceText(t) };
      const b = explainBlocked(s, text);
      if (b) return { kind: 'slip', state: slip(s, 'lost-track', b.text, b.square), message: b.text };
      return { kind: 'slip', state: slip(s, 'illegal', `${r.input} isn't legal here`), message: `${r.input} isn't a legal move here.` };
    }
  }
}

/** Free take-backs per game; any more count as slips. */
export const FREE_TAKE_BACKS = 1;

/** A move made on the board: from one square to another. A promotion asks which piece. */
export function playerMoveSquares(s: GameState, from: Square, to: Square): PlayerMoveResult {
  if (s.result || s.pendingRecall || turnOf(s) !== s.color) return { kind: 'unreadable', message: "It isn't your move." };
  const chess = chessOf(s);
  const p = chess.get(from);
  if (!p || p.color !== s.color) {
    const t = traceFrom(s, from);
    if (t) return { kind: 'slip', state: slip(s, 'lost-track', traceText(t), from), message: traceText(t) };
    return { kind: 'slip', state: slip(s, 'illegal', `No piece of yours on ${from}`, from), message: `None of your pieces is on ${from}.` };
  }
  const legal = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
  if (legal.length > 1) return { kind: 'ambiguous', options: legal.map((x) => ({ san: x.san, uci: x.lan })) };
  const m = legal[0];
  if (!m) {
    const name = PIECE_NAME[p.type];
    return {
      kind: 'slip',
      state: slip(s, 'illegal', `${name} ${from}–${to} isn't legal`, from),
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

/** Undo your last move (and the reply to it). The first one in a game is free; after that each counts as a slip. */
export function takeBack(s: GameState): GameState | null {
  if (s.result) return null;
  const lastOwn = lastIndex(s.moves, (m) => m.color === s.color);
  if (lastOwn < 0) return null;
  const moves = s.moves.slice(0, lastOwn);
  let fog = s.fogStart;
  const c = new Chess(s.startFen);
  for (const pm of moves) fog = nextFog(s.shownAs.hide, fog, c.move(pm.san), pm.color === s.color);
  const undone = s.moves[lastOwn]!;
  const free = s.takeBacks < FREE_TAKE_BACKS;
  return {
    ...(free ? { ...s, moves } : slip({ ...s, moves }, 'take-back', `Took back ${undone.san}`)),
    takeBacks: s.takeBacks + 1,
    fogSquares: fog,
    ownMoves: s.ownMoves - 1,
    pendingRecall: null,
  };
}

function pieceWord(type: string, sq: Square, count: number): string {
  if (type === 'b') return `${isLightSquare(sq) ? 'light' : 'dark'}-squared bishop`;
  return count > 1 ? `one of your ${PIECE_NAME[type]}s` : PIECE_NAME[type]!;
}

/** "Where is your light-squared bishop?" — about a piece you can't see. */
export function makeRecall(s: GameState, rng: Rng): Recall | null {
  const chess = chessOf(s);
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
    ...(correct ? s : slip(s, 'recall', `${rc.prompt} — it was ${rc.answers.join(' or ')}`, rc.answers[0])),
    pendingRecall: null,
    recallMissRun: missRun,
    recalls: { asked: s.recalls.asked + 1, correct: s.recalls.correct + (correct ? 1 : 0) },
  };
  if (missRun >= 2) {
    const easier = easierLevel(s.shownAs.id);
    const target: GameLevel = easier ?? { ...s.shownAs, id: 'none', title: 'No fog', hide: { kind: 'none' }, view: 'board', showMoveList: true };
    const chess = chessOf(s);
    const fog = target.hide.kind === 'fog' ? pickFogSquares(chess, s.color, target.hide.count, rng) : [];
    next = { ...next, shownAs: target, recallMissRun: 0, droppedTo: target.title, fogSquares: fog };
  }
  return { state: next, correct };
}

export function canPeek(s: GameState): boolean {
  return s.peekMsLeft === null || s.peekMsLeft > 0;
}

/** Charge `ms` of peeking against the budget. */
export function spendPeekTime(s: GameState, ms: number): GameState {
  const used = Math.max(0, Math.round(ms));
  return {
    ...s,
    peekMsUsed: s.peekMsUsed + used,
    peekMsLeft: s.peekMsLeft === null ? null : Math.max(0, s.peekMsLeft - used),
  };
}

export function resign(s: GameState): GameState {
  return s.result ? s : { ...s, result: { outcome: 'loss', reason: 'Resigned' }, pendingRecall: null, goalMet: s.goal ? false : null };
}

/** Does this finished ladder game count towards passing its level? */
export function gamePasses(s: GameState): boolean {
  if (!s.result) return false;
  return s.result.outcome !== 'loss' && s.slips.length <= s.level.pass.maxSlips && s.shownAs.id === s.level.id;
}
