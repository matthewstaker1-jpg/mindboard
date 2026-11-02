// Opening lines used as the move bank for Stage 2 drills. Every line is
// replayed through chess.js (see game.ts), so every move asked about is legal
// and every position looks like a real game.

export interface OpeningLine {
  name: string;
  moves: string[];
}

export const OPENING_LINES: OpeningLine[] = [
  {
    name: 'Italian',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 h3 h6 Nbd2 Re8'.split(' '),
  },
  {
    name: 'Italian',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2 Bxd2+ Nbxd2 d5 exd5 Nxd5 Qb3 Nce7 O-O O-O'.split(' '),
  },
  {
    name: 'Italian (Two Knights)',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 d4 exd4 O-O Nxe4 Re1 d5 Bxd5 Qxd5 Nc3 Qa5 Nxe4 Be6'.split(' '),
  },
  {
    name: 'Ruy Lopez',
    moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7'.split(' '),
  },
  {
    name: 'Ruy Lopez (Exchange)',
    moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4 c5 Nb3 Qxd1 Rxd1 Bg4 f3 Be6'.split(' '),
  },
  {
    name: "Queen's Gambit Declined",
    moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7 Rc1 c6 Bd3 dxc4 Bxc4 Nd5 Bxe7 Qxe7 O-O Nxc3 Rxc3 e5'.split(' '),
  },
  {
    name: "Queen's Gambit Declined (Exchange)",
    moves: 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 Qc2 Be7 e3 Nbd7 Bd3 O-O Nge2 Re8 O-O Nf8'.split(' '),
  },
  {
    name: 'Sicilian (Najdorf)',
    moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4 b5'.split(' '),
  },
  {
    name: 'Sicilian (Open)',
    moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Bxf6 gxf6 Nd5 f5'.split(' '),
  },
  {
    name: 'Nimzo-Indian',
    moves: 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3 dxc4 Bxc4 Qc7'.split(' '),
  },
  {
    name: 'Nimzo-Indian (Classical)',
    moves: 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7 f3 h6 Bh4 d5 e3 Nbd7'.split(' '),
  },
  {
    name: 'London',
    moves: 'd4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3 b6 Ne5 Bb7 f4 Ne7'.split(' '),
  },
  {
    name: 'London',
    moves: 'd4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3 Nbd7 O-O Qe8 c4 e5 dxe5 dxe5 Bh2 Qe7'.split(' '),
  },
];

/** Endgame-style positions with a promotion available, for the special-moves level. */
export const PROMOTION_FENS: string[] = [
  '8/4P1k1/8/8/8/8/5K2/8 w - - 0 1',
  '3r4/2P3k1/8/8/8/8/5K2/8 w - - 0 1',
  '8/5k2/8/8/8/8/1p3K2/8 b - - 0 1',
  '8/6k1/8/8/8/8/2p3K1/1N6 b - - 0 1',
  '6k1/1P3pp1/7p/8/8/8/5PPP/6K1 w - - 0 1',
  '4k3/8/8/8/8/8/p5PP/6K1 b - - 0 1',
];
