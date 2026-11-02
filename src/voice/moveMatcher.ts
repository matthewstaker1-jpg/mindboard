// Spoken move → legal move. Never free-parses: the recogniser's alternatives
// are normalised (homophones, filler words) into compact notation and
// fuzzy-matched against only the legal moves in the position.

import { Chess, type Move } from 'chess.js';
import { parseMove } from '../chess/san';

export interface Alternative {
  transcript: string;
  confidence: number;
}

const PIECES: Record<string, string> = {
  knight: 'N', knights: 'N', night: 'N', nights: 'N', nite: 'N', horse: 'N', kn: 'N',
  bishop: 'B', bishops: 'B',
  rook: 'R', rooks: 'R', rock: 'R', rocks: 'R', brook: 'R',
  queen: 'Q', queens: 'Q',
  king: 'K', kings: 'K',
  pawn: 'P', pawns: 'P', porn: 'P', pond: 'P', pan: 'P', prawn: 'P',
};

const FILE_WORDS: Record<string, string> = {
  a: 'a', ay: 'a', eh: 'a', hey: 'a',
  b: 'b', be: 'b', bee: 'b',
  c: 'c', see: 'c', sea: 'c', si: 'c',
  d: 'd', dee: 'd',
  e: 'e', ee: 'e',
  f: 'f', ef: 'f', eff: 'f',
  g: 'g', gee: 'g', jee: 'g',
  h: 'h', aitch: 'h', age: 'h', each: 'h',
};

const RANK_WORDS: Record<string, string> = {
  one: '1', won: '1', '1': '1',
  two: '2', to: '2', too: '2', '2': '2',
  three: '3', tree: '3', '3': '3',
  four: '4', for: '4', fore: '4', '4': '4',
  five: '5', '5': '5',
  six: '6', sicks: '6', sex: '6', '6': '6',
  seven: '7', '7': '7',
  eight: '8', ate: '8', '8': '8',
};

const CAPTURE = new Set(['takes', 'take', 'captures', 'capture', 'x', 'times', 'by']);

/**
 * Spoken text → compact notation, e.g. "knight to f three" → "Nf3",
 * "e takes d five" → "exd5", "castle short" → "O-O".
 */
export function normaliseSpoken(text: string): string {
  let t = text.toLowerCase().replace(/[.,!?'"]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  // Castling phrases first: "castle" alone would otherwise read as a rook.
  if (/\b(long|queen ?side)\b/.test(t) && /\b(castle|castles|castling|o o o)\b/.test(t)) return 'O-O-O';
  if (/\b(castle|castles|castling)\b/.test(t) || /\bo o\b/.test(t) || /\b(short|king ?side) castle/.test(t)) {
    return /\b(long|queen ?side)\b|o o o/.test(t) ? 'O-O-O' : 'O-O';
  }
  t = t.replace(/\b(promotes?|promoting|equals|becomes)( to)?\b/g, ' = ');
  // Split glued squares like "f3" or "e4" said quickly, and keep them as one token.
  const words = t.split(' ').flatMap((w) => (/^[a-h][1-8]$/.test(w) ? [w[0]!, w[1]!] : [w]));

  let out = '';
  let prevFile = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (w === '=') {
      out += '=';
      prevFile = false;
    } else if (PIECES[w]) {
      // After "takes" a piece word names what's captured ("bishop takes knight on f3"): skip it.
      if (!out.endsWith('x')) out += PIECES[w];
      prevFile = false;
    } else if (CAPTURE.has(w)) {
      out += 'x';
      prevFile = false;
    } else if (RANK_WORDS[w] && (prevFile || /^\d$/.test(w))) {
      // "to/too/for" only count as numbers right after a file letter.
      out += RANK_WORDS[w];
      prevFile = false;
    } else if (FILE_WORDS[w] && !(w === 'a' && !FILE_WORDS[words[i + 1] ?? ''] && !RANK_WORDS[words[i + 1] ?? ''])) {
      out += FILE_WORDS[w];
      prevFile = true;
    } else {
      // Filler ("on", "the", "to" before a square) and anything unrecognised.
      prevFile = false;
    }
  }
  return out;
}

/** Every compact form a legal move might come out as. */
export function moveForms(m: Move): string[] {
  const san = m.san.replace(/[+#]/g, '');
  const forms = new Set<string>([san, m.lan, `${m.from}${m.to}`]);
  if (m.isKingsideCastle()) forms.add('O-O');
  if (m.isQueensideCastle()) forms.add('O-O-O');
  const noX = san.replace('x', '');
  forms.add(noX);
  if (m.piece === 'p') {
    forms.add(`P${san}`);
    forms.add(`P${noX}`);
    if (m.captured) {
      forms.add(`Px${m.to}`); // "pawn takes d5"
      forms.add(`${m.from[0]}${m.to}`); // "e d5"
    }
    if (m.promotion) forms.add(san.replace('=', '')); // "e8 queen"
  } else {
    forms.add(`${m.piece.toUpperCase()}${m.to}`); // ignore disambiguation and x
    forms.add(`${m.piece.toUpperCase()}${m.from}${m.to}`); // "knight g1 f3"
    if (m.captured) forms.add(`${m.piece.toUpperCase()}x${m.to}`);
  }
  return [...forms];
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return 1 - lev(x, y) / Math.max(x.length, y.length);
}

export interface Scored {
  move: Move;
  score: number;
  heard: string;
}

export type MatchResult =
  | { kind: 'confident'; move: Move; scored: Scored[] }
  | { kind: 'ask'; options: Move[]; scored: Scored[] }
  | { kind: 'none'; scored: Scored[] };

export const CONFIDENT = 0.75;
export const MARGIN = 0.12;
export const MINIMUM = 0.55;

/** Score every legal move against every alternative the recogniser offered. */
export function scoreMoves(alts: Alternative[], fen: string, only?: Move[]): Scored[] {
  const legal = only ?? new Chess(fen).moves({ verbose: true });
  const best = new Map<string, Scored>();
  for (const alt of alts) {
    const heard = normaliseSpoken(alt.transcript);
    if (!heard) continue;
    const weight = 0.85 + 0.15 * Math.max(0, Math.min(1, alt.confidence || 0.5));
    const exact = parseMove(heard, fen);
    for (const m of legal) {
      let s = Math.max(...moveForms(m).map((f) => similarity(heard, f)));
      if (exact.kind === 'ok' && exact.move.lan === m.lan) s = 1;
      const score = s * weight;
      const prev = best.get(m.lan);
      if (!prev || score > prev.score) best.set(m.lan, { move: m, score, heard });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

export function matchSpokenMove(alts: Alternative[], fen: string, only?: Move[]): MatchResult {
  const scored = scoreMoves(alts, fen, only);
  const [top, second] = scored;
  if (!top || top.score < MINIMUM) return { kind: 'none', scored };
  if (top.score >= CONFIDENT && (!second || top.score - second.score >= MARGIN)) return { kind: 'confident', move: top.move, scored };
  const close = scored.filter((s) => top.score - s.score < MARGIN).slice(0, 3);
  if (close.length === 1) return top.score >= CONFIDENT ? { kind: 'confident', move: top.move, scored } : { kind: 'ask', options: [top.move], scored };
  return { kind: 'ask', options: close.map((s) => s.move), scored };
}
