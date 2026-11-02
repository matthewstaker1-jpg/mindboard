// Voice commands other than moves: "repeat", "where is my bishop", "what's on e5" …

import type { Square } from '../board/squares';

export type Command =
  | { kind: 'repeat' }
  | { kind: 'where'; piece: 'k' | 'q' | 'r' | 'b' | 'n' | 'p' }
  | { kind: 'list' }
  | { kind: 'whatsOn'; square: Square }
  | { kind: 'takeBack' }
  | { kind: 'resign' }
  | { kind: 'cancel' }
  | { kind: 'yes' }
  | { kind: 'choice'; index: number };

const PIECE: Record<string, 'k' | 'q' | 'r' | 'b' | 'n' | 'p'> = {
  king: 'k', queen: 'q', rook: 'r', rooks: 'r', rock: 'r', bishop: 'b', bishops: 'b',
  knight: 'n', knights: 'n', night: 'n', horse: 'n', pawn: 'p', pawns: 'p',
};

const ORDINAL: Record<string, number> = { first: 0, one: 0, second: 1, two: 1, third: 2, three: 2, last: -1 };

export function parseCommand(text: string): Command | null {
  const t = text.toLowerCase().replace(/[.,!?']/g, '').replace(/\s+/g, ' ').trim();
  if (/^(no|nope|cancel|stop|wait|undo that)$/.test(t)) return { kind: 'cancel' };
  if (/^(yes|yeah|yep|confirm|correct|do it|play it)$/.test(t)) return { kind: 'yes' };
  if (/\b(repeat|say (that )?again|what was that|pardon|last move)\b/.test(t)) return { kind: 'repeat' };
  if (/\b(take ?back|undo)\b/.test(t)) return { kind: 'takeBack' };
  if (/\b(i )?resign\b/.test(t)) return { kind: 'resign' };
  if (/\b(list|what do i have|my pieces)\b/.test(t)) return { kind: 'list' };
  const where = t.match(/\bwhere(?: is|s| are)? (?:my |the )?(\w+)/);
  if (where && PIECE[where[1]!]) return { kind: 'where', piece: PIECE[where[1]!]! };
  const on = t.match(/\bwhat(?: is|s)? on ([a-h]) ?([1-8]|one|two|three|four|five|six|seven|eight)\b/);
  if (on) {
    const n = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 }[on[2]!] ?? Number(on[2]);
    return { kind: 'whatsOn', square: `${on[1]}${n}` as Square };
  }
  const ord = t.match(/^(?:the )?(first|second|third|last)(?: one)?$/);
  if (ord) return { kind: 'choice', index: ORDINAL[ord[1]!]! };
  return null;
}
