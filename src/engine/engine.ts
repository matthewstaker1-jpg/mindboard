// Stockfish over UCI, running in a Web Worker so the board never freezes.
// The worker script is the stock Stockfish.js build copied into
// public/engine (see scripts/copy-engine.mjs). Commands are serialised: one
// search at a time.

export interface UciWorker {
  postMessage(cmd: string): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  terminate(): void;
}

export interface Score {
  /** Centipawns from the side to move's point of view. */
  cp?: number;
  /** Moves to mate; negative means the side to move gets mated. */
  mate?: number;
}

export interface SearchResult {
  /** Best move in UCI form, e.g. "g1f3" or "e7e8q"; null when there is none (mate/stalemate). */
  best: string | null;
  score: Score;
}

/** The engine's real strength floor; below this we use Skill Level instead. */
export const UCI_ELO_MIN = 1320;

export interface Strength {
  options: [string, string][];
  /** How the search is limited. */
  go: string;
}

/**
 * Map a target rating to engine settings. From 1320 up Stockfish limits
 * itself; below that, a low Skill Level plus a shallow, quick search makes
 * it miss things the way a club beginner does.
 */
export function strengthFor(elo: number): Strength {
  if (elo >= UCI_ELO_MIN) {
    return {
      options: [
        ['Skill Level', '20'],
        ['UCI_LimitStrength', 'true'],
        ['UCI_Elo', String(Math.min(3190, Math.round(elo)))],
      ],
      go: 'go movetime 400',
    };
  }
  const skill = Math.max(0, Math.min(8, Math.round((elo - 600) / 90)));
  const depth = elo < 900 ? 2 : elo < 1100 ? 4 : 6;
  return {
    options: [
      ['UCI_LimitStrength', 'false'],
      ['Skill Level', String(skill)],
    ],
    go: `go depth ${depth} movetime 300`,
  };
}

export function parseInfoScore(line: string): Score | null {
  const m = line.match(/\bscore (cp|mate) (-?\d+)/);
  if (!m) return null;
  return m[1] === 'cp' ? { cp: Number(m[2]) } : { mate: Number(m[2]) };
}

export function parseBestMove(line: string): string | null | undefined {
  const m = line.match(/^bestmove (\S+)/);
  if (!m) return undefined;
  return m[1] === '(none)' ? null : m[1]!;
}

export function defaultWorker(): UciWorker {
  return new Worker(`${import.meta.env.BASE_URL}engine/stockfish.js`) as unknown as UciWorker;
}

export class Engine {
  private worker: UciWorker;
  private listeners = new Set<(line: string) => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private booted: Promise<void>;
  private appliedOptions = new Map<string, string>();

  constructor(make: () => UciWorker = defaultWorker) {
    this.worker = make();
    this.worker.onmessage = (e) => {
      const text = typeof e.data === 'string' ? e.data : String(e.data);
      for (const line of text.split('\n')) for (const l of this.listeners) l(line);
    };
    this.booted = this.send('uci', (l) => l === 'uciok').then(() => this.isReady());
  }

  private send(cmd: string, until?: (line: string) => boolean, onLine?: (line: string) => void): Promise<void> {
    return new Promise((resolve) => {
      if (!until) {
        this.worker.postMessage(cmd);
        resolve();
        return;
      }
      const l = (line: string) => {
        onLine?.(line);
        if (until(line)) {
          this.listeners.delete(l);
          resolve();
        }
      };
      this.listeners.add(l);
      this.worker.postMessage(cmd);
    });
  }

  private isReady() {
    return this.send('isready', (l) => l === 'readyok');
  }

  /** Run one task at a time, after boot. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(() => this.booted).then(task);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async setOptions(opts: [string, string][]) {
    let changed = false;
    for (const [name, value] of opts) {
      if (this.appliedOptions.get(name) === value) continue;
      await this.send(`setoption name ${name} value ${value}`);
      this.appliedOptions.set(name, value);
      changed = true;
    }
    if (changed) await this.isReady();
  }

  private async search(fen: string, go: string): Promise<SearchResult> {
    await this.send(`position fen ${fen}`);
    let score: Score = {};
    let best: string | null = null;
    await this.send(
      go,
      (l) => parseBestMove(l) !== undefined,
      (l) => {
        if (l.startsWith('info') && !l.includes(' upperbound') && !l.includes(' lowerbound')) {
          score = parseInfoScore(l) ?? score;
        }
        const b = parseBestMove(l);
        if (b !== undefined) best = b;
      },
    );
    return { best, score };
  }

  /** The engine's move at a given strength (UCI notation). */
  bestMove(fen: string, elo: number): Promise<SearchResult> {
    return this.enqueue(async () => {
      const s = strengthFor(elo);
      await this.setOptions(s.options);
      return this.search(fen, s.go);
    });
  }

  /** Full-strength evaluation (for review and, later, the blunder guard). */
  evaluate(fen: string, depth = 12): Promise<SearchResult> {
    return this.enqueue(async () => {
      await this.setOptions([
        ['UCI_LimitStrength', 'false'],
        ['Skill Level', '20'],
      ]);
      return this.search(fen, `go depth ${depth}`);
    });
  }

  newGame(): Promise<void> {
    return this.enqueue(async () => {
      await this.send('ucinewgame');
      await this.isReady();
    });
  }

  terminate() {
    this.worker.terminate();
  }
}

let shared: Engine | null = null;

/** One engine for the whole app; it takes a moment to load, so start it early. */
export function getEngine(): Engine {
  shared ??= new Engine();
  return shared;
}
