// Measures how strong the app's engine settings really play, by playing
// matches in Node with the same Stockfish build the app uses.
//
//   npx vite-node scripts/calibrate.ts [gamesPerMatch=60] [parallel=6]
//
// Below 1320 the app uses its own "shallow search + occasional slip"
// settings (LOW_SETTINGS in src/engine/engine.ts). We chain matches down from
// Stockfish's own rating-limited mode (UCI_LimitStrength, which starts at
// 1320): strongest low setting vs UCI_Elo 1320, then each setting vs the
// next stronger one. Copy the results into LOW_SETTINGS' `measured`.
// Each match's score gives an Elo difference; adding them up gives a rating
// per setting. Stockfish's UCI_Elo is anchored to engine rating lists, so the
// results are "Stockfish-scale" ratings: a fair comparison between levels,
// and a rough (not exact) guide to human ratings.
//
// Writes the results to docs/engine-calibration.json.
// The first run (2026-11-02) labelled settings by their old targets (app 800/1000/1200).

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';
import { OPENING_LINES } from '../src/chess/openings';
import { LOW_SETTINGS, lowStrength, parseBestMove, parseInfoPv } from '../src/engine/engine';

const ENGINE = 'node_modules/stockfish/src/stockfish-17.1-lite-single-03e3232.js';
const GAMES = Number(process.argv[2] ?? 60);
const PARALLEL = Number(process.argv[3] ?? 6);
const MAX_PLIES = 200;

/** An app low setting (index into LOW_SETTINGS), or Stockfish's own limiter. */
type Player = { kind: 'app'; setting: number } | { kind: 'sf'; elo: number; movetime: number };
const label = (p: Player) => {
  if (p.kind === 'sf') return `Stockfish UCI_Elo ${p.elo}`;
  const s = LOW_SETTINGS[p.setting]!;
  return `app depth ${s.depth} mistakes ${s.mistakeRate}`;
};

class Uci {
  private proc = spawn(process.execPath, [ENGINE], { stdio: ['pipe', 'pipe', 'ignore'] });
  private waiters: ((line: string) => boolean)[] = [];
  private applied = new Map<string, string>();
  constructor() {
    createInterface({ input: this.proc.stdout! }).on('line', (line) => {
      this.waiters = this.waiters.filter((w) => !w(line));
    });
  }
  send(cmd: string) {
    this.proc.stdin!.write(cmd + '\n');
  }
  until(cmd: string, done: (l: string) => boolean, onLine?: (l: string) => void): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push((l) => {
        onLine?.(l);
        if (done(l)) {
          resolve();
          return true;
        }
        return false;
      });
      this.send(cmd);
    });
  }
  async init() {
    await this.until('uci', (l) => l === 'uciok');
    await this.until('isready', (l) => l === 'readyok');
  }
  async options(opts: [string, string][]) {
    for (const [k, v] of opts) {
      if (this.applied.get(k) === v) continue;
      this.send(`setoption name ${k} value ${v}`);
      this.applied.set(k, v);
    }
    await this.until('isready', (l) => l === 'readyok');
  }
  /** Same move choice as Engine.search in src/engine/engine.ts. */
  async move(fen: string, go: string, mistakeRate: number): Promise<string | null> {
    this.send(`position fen ${fen}`);
    let best: string | null = null;
    const cands = new Map<number, string>();
    await this.until(
      go,
      (l) => parseBestMove(l) !== undefined,
      (l) => {
        const pv = parseInfoPv(l);
        if (pv) cands.set(pv.index, pv.move);
        const b = parseBestMove(l);
        if (b !== undefined) best = b;
      },
    );
    const others = [...cands.entries()].filter(([i, m]) => i > 1 && m !== best).map(([, m]) => m);
    if (best && others.length && Math.random() < mistakeRate) best = others[Math.floor(Math.random() * others.length)]!;
    return best;
  }
  async play(p: Player, fen: string): Promise<string | null> {
    if (p.kind === 'app') {
      const s = lowStrength(LOW_SETTINGS[p.setting]!);
      await this.options(s.options);
      return this.move(fen, s.go, s.mistakeRate);
    }
    await this.options([
      ['MultiPV', '1'],
      ['Skill Level', '20'],
      ['UCI_LimitStrength', 'true'],
      ['UCI_Elo', String(p.elo)],
    ]);
    return this.move(fen, `go movetime ${p.movetime}`, 0);
  }
  newGame() {
    return this.until('ucinewgame\nisready', (l) => l === 'readyok');
  }
  quit() {
    this.send('quit');
  }
}

/** Short, varied starts: the first 4 plies of each opening line, played from both sides. */
const STARTS = [...new Set(OPENING_LINES.map((l) => l.moves.slice(0, 4).join(' ')))];

/** 1 / 0.5 / 0 for player A. */
async function game(a: Player, b: Player, aWhite: boolean, start: string, ea: Uci, eb: Uci): Promise<number> {
  const c = new Chess();
  for (const m of start.split(' ')) c.move(m);
  await Promise.all([ea.newGame(), eb.newGame()]);
  while (!c.isGameOver() && c.history().length < MAX_PLIES) {
    const aToMove = (c.turn() === 'w') === aWhite;
    const uci = await (aToMove ? ea.play(a, c.fen()) : eb.play(b, c.fen()));
    if (!uci) break;
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }
  if (c.isCheckmate()) return (c.turn() === 'w') === aWhite ? 0 : 1;
  return 0.5;
}

async function match(a: Player, b: Player): Promise<{ score: number; games: number; w: number; d: number; l: number }> {
  const jobs = Array.from({ length: GAMES }, (_, i) => ({ aWhite: i % 2 === 0, start: STARTS[Math.floor(i / 2) % STARTS.length]! }));
  let w = 0, d = 0, l = 0;
  const workers = Array.from({ length: PARALLEL }, async () => {
    const ea = new Uci();
    const eb = new Uci();
    await Promise.all([ea.init(), eb.init()]);
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const r = await game(a, b, job.aWhite, job.start, ea, eb);
      if (r === 1) w++;
      else if (r === 0) l++;
      else d++;
      process.stdout.write(r === 1 ? '+' : r === 0 ? '-' : '=');
    }
    ea.quit();
    eb.quit();
  });
  await Promise.all(workers);
  process.stdout.write('\n');
  return { score: (w + d / 2) / GAMES, games: GAMES, w, d, l };
}

/** Elo difference implied by a score, clamped so 0% / 100% don't blow up. */
function eloDiff(score: number, games: number): number {
  const s = Math.min(1 - 0.5 / games, Math.max(0.5 / games, score));
  return -400 * Math.log10(1 / s - 1);
}

/** Rough 95% margin on the Elo difference. */
function margin(score: number, games: number): number {
  const s = Math.min(1 - 0.5 / games, Math.max(0.5 / games, score));
  const se = Math.sqrt((s * (1 - s)) / games);
  return Math.round((eloDiff(Math.min(0.999, s + 1.96 * se), games) - eloDiff(Math.max(0.001, s - 1.96 * se), games)) / 2);
}

async function main() {
  const anchor: Player = { kind: 'sf', elo: 1320, movetime: 200 };
  // Strongest low setting against the anchor, then each one against the next stronger.
  const chain: [Player, Player][] = [];
  for (let i = LOW_SETTINGS.length - 1; i >= 0; i--) {
    chain.push([{ kind: 'app', setting: i }, i === LOW_SETTINGS.length - 1 ? anchor : { kind: 'app', setting: i + 1 }]);
  }
  const results = [];
  let rating = anchor.elo;
  for (const [a, b] of chain) {
    console.log(`${label(a)} vs ${label(b)} (${GAMES} games)`);
    const r = await match(a, b);
    const diff = eloDiff(r.score, r.games);
    rating += diff;
    const row = { setting: label(a), opponent: label(b), ...r, eloDiff: Math.round(diff), margin: margin(r.score, r.games), measured: Math.round(rating) };
    console.log(row);
    results.push(row);
  }
  writeFileSync(
    'docs/engine-calibration.json',
    JSON.stringify({ date: new Date().toISOString().slice(0, 10), engine: ENGINE.split('/').pop(), anchor: label(anchor), results }, null, 2) + '\n',
  );
  console.log('Wrote docs/engine-calibration.json');
}

void main();
