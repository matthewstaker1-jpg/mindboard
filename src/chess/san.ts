// Forgiving typed-move parser for games. Never free-parses: it reads what
// the input could mean and matches only against the legal moves in the
// position, so "nf3", "Nf3", "g1f3", "g1-f3", "0-0", "o-o" and "ed5" all work.

import { Chess, type Move } from 'chess.js';

export type ParseResult =
  | { kind: 'ok'; move: Move }
  | { kind: 'ambiguous'; options: Move[] }
  | { kind: 'illegal'; input: string }
  | { kind: 'unreadable'; input: string };

interface Pattern {
  piece: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  fromFile?: string;
  fromRank?: string;
  to: string;
  promotion?: string;
}

const SAN_RE = /^([KQRBNkqrbn])?([a-h])?([1-8])?x?([a-h][1-8])(?:=?([QRBNqrbn]))?$/;
const COORD_RE = /^([a-h][1-8])[-x]?([a-h][1-8])=?([qrbnQRBN])?$/;

/** The readings an input could have; "bc4" is both a bishop move and a b-pawn capture. */
function readings(s: string): Pattern[] {
  const m = s.match(SAN_RE);
  if (!m) return [];
  const [, pc, file, rank, to, promo] = m;
  const out: Pattern[] = [];
  const promotion = promo?.toLowerCase();
  if (pc) {
    out.push({ piece: pc.toLowerCase() as Pattern['piece'], fromFile: file, fromRank: rank, to: to!, promotion });
    // A lowercase "b" with no other origin could also be the b-file.
    if (pc === 'b' && !file) out.push({ piece: 'p', fromFile: 'b', fromRank: rank, to: to!, promotion });
  } else {
    out.push({ piece: 'p', fromFile: file, fromRank: rank, to: to!, promotion });
  }
  return out;
}

function matches(m: Move, p: Pattern): boolean {
  if (m.piece !== p.piece || m.to !== p.to) return false;
  if (p.fromFile && m.from[0] !== p.fromFile) return false;
  if (p.fromRank && m.from[1] !== p.fromRank) return false;
  if (m.promotion) return m.promotion === (p.promotion ?? 'q');
  return !p.promotion;
}

export function parseMove(input: string, fen: string): ParseResult {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  const raw = input.trim();
  const s = raw.replace(/\s+/g, '').replace(/[+#!?]+$/, '');
  if (!s) return { kind: 'unreadable', input: raw };

  const pick = (found: Move[]): ParseResult => {
    const uniq = [...new Map(found.map((m) => [m.lan, m])).values()];
    if (uniq.length === 1) return { kind: 'ok', move: uniq[0]! };
    if (uniq.length > 1) return { kind: 'ambiguous', options: uniq };
    return { kind: 'illegal', input: raw };
  };

  // Castling: O-O, 0-0, o-o, OO, with or without dashes.
  const castle = s.replace(/0/g, 'O').toUpperCase().replace(/-/g, '');
  if (castle === 'OO' || castle === 'OOO') {
    return pick(legal.filter((m) => (castle === 'OO' ? m.isKingsideCastle() : m.isQueensideCastle())));
  }

  // Coordinates: g1f3, g1-f3, e7e8q.
  const c = s.match(COORD_RE);
  if (c) {
    const [, from, to, promo] = c;
    return pick(legal.filter((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === (promo?.toLowerCase() ?? 'q'))));
  }

  // SAN-ish: Nf3, nf3, Nxf3, Nbd2, exd5, ed5, e8=Q, e8Q. Dashes as in "N-f3" are dropped.
  const r = readings(s.replace(/-/g, ''));
  if (r.length === 0) return { kind: 'unreadable', input: raw };
  return pick(legal.filter((m) => r.some((p) => matches(m, p))));
}
