// Builds the bundled training content from Lichess's public-domain (CC0) data:
//   - chess-openings TSVs (github.com/lichess-org/chess-openings): named lines
//   - one monthly rated-games file (database.lichess.org): real game lines and
//     middlegame positions
//   - the start of the puzzle database (database.lichess.org): mate-in-N and
//     pawn-ending positions from real games
// Every move is replayed through chess.js, so anything malformed is dropped.
//
//   npx vite-node scripts/build-content.ts <data-dir>
//
// The data dir holds a.tsv … e.tsv, games-*.pgn.zst and puzzles-part.csv.zst.
// Writes src/content/{lines,middlegames,puzzles}.json.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createZstdDecompress } from 'node:zlib';
import { Chess } from 'chess.js';

const dir = process.argv[2];
if (!dir) throw new Error('Usage: vite-node scripts/build-content.ts <data-dir>');
const OUT = 'src/content';

const MAX_GAME_LINES = 600;
const MAX_MIDDLEGAMES = 400;
const MAX_MATES = 200;
const MAX_PAWN_ENDINGS = 100;
const GAME_PLIES = 30;

/**
 * Lichess files are pzstd-style: each zstd frame is preceded by a skippable
 * frame holding its length. Node's decompressor rejects skippable frames, so
 * strip them and keep the real frames.
 */
function zstdFrames(buf: Buffer): Buffer {
  const parts: Buffer[] = [];
  let off = 0;
  while (off + 8 <= buf.length) {
    const magic = buf.readUInt32LE(off);
    if ((magic & 0xfffffff0) !== 0x184d2a50) {
      parts.push(buf.subarray(off));
      break;
    }
    const size = buf.readUInt32LE(off + 4);
    const frameLen = size === 4 ? buf.readUInt32LE(off + 8) : 0;
    off += 8 + size;
    parts.push(buf.subarray(off, off + frameLen));
    off += frameLen;
  }
  return Buffer.concat(parts);
}

/** Read a .zst file line by line. A truncated file (a partial download) just ends early. */
async function* zstLines(path: string): AsyncGenerator<string> {
  const z = createZstdDecompress();
  z.end(zstdFrames(readFileSync(path)));
  let failed = false;
  z.on('error', () => {
    failed = true;
    z.destroy();
  });
  const rl = createInterface({ input: z, crlfDelay: Infinity });
  try {
    for await (const line of rl) yield line;
  } catch {
    if (!failed) throw new Error(`Could not read ${path}`);
  }
}

/** SAN moves from movetext or a short PGN, without numbers, comments or results. */
function sanList(text: string): string[] {
  return text
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

/** Replay; null if any move is illegal. */
function replay(moves: string[], fen?: string): Chess | null {
  const c = new Chess(fen);
  try {
    for (const m of moves) c.move(m);
  } catch {
    return null;
  }
  return c;
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function materialDiff(c: Chess): number {
  let d = 0;
  for (const row of c.board()) for (const sq of row) if (sq) d += (sq.color === 'w' ? 1 : -1) * VALUE[sq.type]!;
  return d;
}

// ---- Named opening lines ---------------------------------------------------
interface Line {
  name: string;
  moves: string[];
}
const openingLines: Line[] = [];
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const rows = readFileSync(join(dir, `${f}.tsv`), 'utf8').split('\n').slice(1);
  for (const row of rows) {
    const [, name, pgn] = row.split('\t');
    if (!name || !pgn) continue;
    const moves = sanList(pgn);
    if (moves.length < 6 || !replay(moves)) continue;
    openingLines.push({ name, moves: replay(moves)!.history() });
  }
}

// ---- Real games ------------------------------------------------------------
interface Position {
  id: string;
  title: string;
  fen: string;
}
const gameLines: Line[] = [];
const middlegames: Position[] = [];
const gamesFile = readdirSync(dir).find((n) => n.startsWith('games-') && n.endsWith('.pgn.zst'));
if (!gamesFile) throw new Error('No games-*.pgn.zst in the data dir');

let headers: Record<string, string> = {};
let movetext = '';
let gameNo = 0;
const finishGame = () => {
  const text = movetext;
  const h = headers;
  movetext = '';
  headers = {};
  if (!text) return;
  gameNo++;
  const we = Number(h.WhiteElo);
  const be = Number(h.BlackElo);
  if (h.Termination && h.Termination !== 'Normal') return;
  const moves = sanList(text);
  if (moves.length < 40) return;
  const name = h.Opening && h.Opening !== '?' ? h.Opening : 'Lichess game';
  // Follow the moves: the first 30 plies of games between 1800+ players.
  if (gameLines.length < MAX_GAME_LINES && we >= 1800 && be >= 1800) {
    const c = replay(moves.slice(0, GAME_PLIES));
    if (c) gameLines.push({ name, moves: c.history() });
  }
  // Study: a quiet, level position between moves 9 and 13 of a 1700+ game.
  if (middlegames.length < MAX_MIDDLEGAMES && we >= 1700 && be >= 1700 && gameNo % 3 === 0) {
    const c = new Chess();
    for (let i = 0; i < 26 && i < moves.length; i++) {
      let m;
      try {
        m = c.move(moves[i]!);
      } catch {
        return;
      }
      if (i < 17) continue;
      if (m.captured || m.san.includes('+') || c.inCheck()) continue;
      if (Math.abs(materialDiff(c)) > 1) continue;
      // No capture available that wins a piece outright for the side to move.
      const hanging = c.moves({ verbose: true }).some((x) => x.captured && VALUE[x.captured]! >= 3 && VALUE[x.piece]! < VALUE[x.captured]!);
      if (hanging) continue;
      middlegames.push({ id: `lg-${gameNo}`, title: name, fen: c.fen() });
      return;
    }
  }
};

for await (const line of zstLines(join(dir, gamesFile))) {
  if (line.startsWith('[')) {
    if (movetext) finishGame();
    const m = line.match(/^\[(\w+) "(.*)"\]$/);
    if (m) headers[m[1]!] = m[2]!;
  } else if (line.trim()) {
    movetext += ' ' + line;
  }
  if (gameLines.length >= MAX_GAME_LINES && middlegames.length >= MAX_MIDDLEGAMES) break;
}
finishGame();

// ---- Puzzles ---------------------------------------------------------------
interface PuzzlePos extends Position {
  goal: { kind: 'mate'; within: number } | { kind: 'promote'; within: number };
  rating: number;
}
const mates: PuzzlePos[] = [];
const pawnEndings: PuzzlePos[] = [];
for await (const line of zstLines(join(dir, 'puzzles-part.csv.zst'))) {
  const [id, fen, movesStr, rating, , popularity, plays, themesStr] = line.split(',');
  if (!id || id === 'PuzzleId' || !fen || !movesStr || !themesStr) continue;
  const r = Number(rating);
  if (!(r <= 1700) || Number(popularity) < 85 || Number(plays) < 300) continue;
  const themes = themesStr.split(' ');
  const uci = movesStr.split(' ');
  // The puzzle starts after the opponent's first move.
  const c = new Chess(fen);
  try {
    c.move({ from: uci[0]!.slice(0, 2), to: uci[0]!.slice(2, 4), promotion: uci[0]![4] });
  } catch {
    continue;
  }
  const yourMoves = Math.ceil((uci.length - 1) / 2);
  if (mates.length < MAX_MATES && (themes.includes('mateIn2') || themes.includes('mateIn3'))) {
    const n = themes.includes('mateIn2') ? 2 : 3;
    // Balance mate-in-2 and mate-in-3.
    if (mates.filter((m) => m.goal.kind === 'mate' && m.goal.within === n + 1).length >= MAX_MATES / 2) continue;
    mates.push({ id: `pz-${id}`, title: `Mate in ${n}`, fen: c.fen(), goal: { kind: 'mate', within: n + 1 }, rating: r });
  } else if (pawnEndings.length < MAX_PAWN_ENDINGS && themes.includes('pawnEndgame') && themes.includes('advancedPawn')) {
    pawnEndings.push({ id: `pz-${id}`, title: 'Pawn ending', fen: c.fen(), goal: { kind: 'promote', within: yourMoves + 3 }, rating: r });
  }
  if (mates.length >= MAX_MATES && pawnEndings.length >= MAX_PAWN_ENDINGS) break;
}

mkdirSync(OUT, { recursive: true });
const lines = [...openingLines, ...gameLines];
writeFileSync(join(OUT, 'lines.json'), JSON.stringify(lines));
writeFileSync(join(OUT, 'middlegames.json'), JSON.stringify(middlegames));
writeFileSync(join(OUT, 'puzzles.json'), JSON.stringify([...mates, ...pawnEndings]));
console.log({
  openingLines: openingLines.length,
  gameLines: gameLines.length,
  middlegames: middlegames.length,
  mates: mates.length,
  pawnEndings: pawnEndings.length,
});
