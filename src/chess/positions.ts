// Positions for "Study and continue": study one, it fades, then play a short
// goal from it. Middlegames come from the ends of the opening lines, so they
// look like real games; endgames are hand-picked with clear targets.

import type { Goal } from '../game/fogGame';
import { replayLine } from './game';
import { OPENING_LINES } from './openings';

export interface StudyPosition {
  id: string;
  title: string;
  fen: string;
  goal: Goal;
  /** One line on what to aim for. */
  note: string;
}

export const ENDGAMES: StudyPosition[] = [
  {
    id: 'kq-k-white',
    title: 'Queen vs bare king',
    fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1',
    goal: { kind: 'mate', within: 15 },
    note: 'Box the king in with your queen, bring your king up, mate.',
  },
  {
    id: 'kq-k-black',
    title: 'Queen vs bare king (as Black)',
    fen: '4k2q/8/8/8/4K3/8/8/8 b - - 0 1',
    goal: { kind: 'mate', within: 15 },
    note: 'Same technique from the other side of the board.',
  },
  {
    id: 'kr-k',
    title: 'Rook vs bare king',
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    goal: { kind: 'mate', within: 30 },
    note: 'Cut the king off with the rook and walk it to the edge.',
  },
  {
    id: 'kp-k',
    title: 'King and pawn',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    goal: { kind: 'promote', within: 12 },
    note: 'Your king is in front of the pawn: shepherd it home.',
  },
  {
    id: 'kp-k-black',
    title: 'King and pawn (as Black)',
    fen: '8/8/8/8/3p4/3k4/8/3K4 b - - 0 1',
    goal: { kind: 'promote', within: 12 },
    note: 'Take the opposition and push.',
  },
];

let middlegames: StudyPosition[] | null = null;

export function middlegamePositions(): StudyPosition[] {
  middlegames ??= OPENING_LINES.map((line, i) => {
    const last = replayLine(line.moves, line.name).at(-1)!;
    return {
      id: `mg-${i}`,
      title: line.name,
      fen: last.fenAfter,
      goal: { kind: 'moves', n: 8 } as Goal,
      note: 'Play 8 good moves without losing track. Keep the position at least as good as you found it.',
    };
  });
  return middlegames;
}

export function allStudyPositions(): StudyPosition[] {
  return [...middlegamePositions(), ...ENDGAMES];
}
