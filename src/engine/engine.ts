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
  /** Chance of playing one of the other top candidate moves instead of the best. */
  mistakeRate: number;
}

/** Candidate moves considered when the engine is allowed to slip. */
const CANDIDATES = 4;

/**
 * Map a target rating to engine settings. From 1320 up Stockfish limits
 * itself. Even its lowest Skill Level plays at roughly that strength, so
 * below 1320 it searches very shallowly and sometimes picks one of its other
 * top candidates: plausible beginner mistakes rather than random blunders.
 */
export function strengthFor(elo: number): Strength {
  if (elo >= UCI_ELO_MIN) {
    return {
      options: [
        ['MultiPV', '1'],
        ['Skill Level', '20'],
        ['UCI_LimitStrength', 'true'],
        ['UCI_Elo', String(Math.min(3190, Math.round(elo)))],
      ],
      go: 'go movetime 400',
      mistakeRate: 0,
    };
  }
  const depth = elo < 900 ? 1 : elo < 1100 ? 2 : 3;
  return {
    options: [
      ['MultiPV', String(CANDIDATES)],
      ['UCI_LimitStrength', 'false'],
      ['Skill Level', '0'],
    ],
    go: `go depth ${depth}`,
    mistakeRate: Math.min(0.5, Math.max(0, (UCI_ELO_MIN - elo) / 1000)),
  };
}

export function parseInfoScore(line: string): Score | null {
  const m = line.match(/\bscore (cp|mate) (-?\d+)/);
  if (!m) return null;
  return m[1] === 'cp' ? { cp: Number(m[2]) } : { mate: Number(m[2]) };
}

/** "info ... multipv 2 ... pv e2e4 e7e5" → { index: 2, move: 'e2e4' }. */
export function parseInfoPv(line: string): { index: number; move: string } | null {
  if (!line.startsWith('info') || / (upper|lower)bound/.test(line)) return null;
  const pv = line.match(/ pv (\S+)/);
  if (!pv) return null;
  const mp = line.match(/ multipv (\d+)/);
  return { index: mp ? Number(mp[1]) : 1, move: pv[1]! };
}

export function parseBestMove(line: string): string | null | undefined {
  const m = line.match(/^bestmove (\S+)/);
  if (!m) return undefined;
  return m[1] === '(none)' ? null : m[1]!;
}

export function defaultWorker(): UciWorker {
  return new Worker(`${import.meta.env.BASE_URL}engine/stockfish.js`) as unknown as UciWorker;
}

/** How long a search may take before the worker is assumed stuck and restarted. */
export const SEARCH_TIMEOUT_MS = 15_000;
/** First load downloads the engine, which can be slow on a phone. */
export const BOOT_TIMEOUT_MS = 60_000;

export class EngineTimeout extends Error {
  constructor(what: string) {
    super(`The engine took too long (${what}) and was restarted.`);
  }
}

export class Engine {
  private worker!: UciWorker;
  private listeners = new Set<(line: string) => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private booted!: Promise<void>;
  private appliedOptions = new Map<string, string>();
  /** Resolves once the engine has loaded and answered. */
  ready = false;

  constructor(
    private make: () => UciWorker = defaultWorker,
    private rng: () => number = Math.random,
    private timeouts = { search: SEARCH_TIMEOUT_MS, boot: BOOT_TIMEOUT_MS },
  ) {
    this.start();
  }

  private start() {
    this.ready = false;
    this.listeners.clear();
    this.appliedOptions.clear();
    this.worker = this.make();
    this.worker.onmessage = (e) => {
      const text = typeof e.data === 'string' ? e.data : String(e.data);
      for (const line of text.split('\n')) for (const l of [...this.listeners]) l(line);
    };
    this.booted = this.withTimeout(
      this.send('uci', (l) => l === 'uciok').then(() => this.isReady()),
      this.timeouts.boot,
      'loading',
    ).then(() => {
      this.ready = true;
    });
    // Don't leave an unhandled rejection if nobody is waiting yet.
    this.booted.catch(() => undefined);
  }

  /** Kill a stuck worker and start a fresh one; queued work continues on the new one. */
  private restart() {
    this.worker.terminate();
    this.start();
  }

  private withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        this.restart();
        reject(new EngineTimeout(what));
      }, ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }

  /** Waits for the engine to load (useful to show a loading state). */
  whenReady(): Promise<void> {
    return this.booted;
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

  /** Run one task at a time, after boot, each with a time limit. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain
      .then(() => this.booted)
      .then(() => this.withTimeout(task(), this.timeouts.search, 'thinking'));
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

  private async search(fen: string, go: string, mistakeRate = 0): Promise<SearchResult> {
    await this.send(`position fen ${fen}`);
    let score: Score = {};
    let best: string | null = null;
    const candidates = new Map<number, string>();
    await this.send(
      go,
      (l) => parseBestMove(l) !== undefined,
      (l) => {
        const pv = parseInfoPv(l);
        if (pv) {
          candidates.set(pv.index, pv.move);
          if (pv.index === 1) score = parseInfoScore(l) ?? score;
        }
        const b = parseBestMove(l);
        if (b !== undefined) best = b;
      },
    );
    const others = [...candidates.entries()].filter(([i, m]) => i > 1 && m !== best).map(([, m]) => m);
    if (best && others.length && this.rng() < mistakeRate) {
      best = others[Math.floor(this.rng() * others.length)]!;
    }
    return { best, score };
  }

  /** The engine's move at a given strength (UCI notation). */
  bestMove(fen: string, elo: number): Promise<SearchResult> {
    return this.enqueue(async () => {
      const s = strengthFor(elo);
      await this.setOptions(s.options);
      return this.search(fen, s.go, s.mistakeRate);
    });
  }

  /** Full-strength evaluation (for review and, later, the blunder guard). */
  evaluate(fen: string, depth = 12): Promise<SearchResult> {
    return this.enqueue(async () => {
      await this.setOptions([
        ['MultiPV', '1'],
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
let reviewer: Engine | null = null;

/** One engine for play; it takes a moment to load, so start it early. */
export function getEngine(): Engine {
  shared ??= new Engine();
  return shared;
}

/** A second engine for post-game review, so a review never delays the next game. */
export function getReviewEngine(): Engine {
  reviewer ??= new Engine();
  return reviewer;
}

/** Download progress of the engine file (0–1), or null before it starts. */
export type LoadListener = (fraction: number | null) => void;
let loadFraction: number | null = null;
const loadListeners = new Set<LoadListener>();
let preloading: Promise<void> | null = null;

/**
 * Fetch the engine's .wasm ourselves so we can report progress; the worker
 * then gets it from the browser cache.
 */
export function preloadEngine(): Promise<void> {
  preloading ??= (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}engine/stockfish.wasm`);
      const total = Number(res.headers.get('content-length')) || 0;
      if (!res.body || !total) return;
      const reader = res.body.getReader();
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        loadFraction = Math.min(1, got / total);
        loadListeners.forEach((l) => l(loadFraction));
      }
    } catch {
      // Progress is a nicety; the worker loads the file either way.
    } finally {
      loadFraction = 1;
      loadListeners.forEach((l) => l(1));
    }
  })();
  return preloading;
}

export function onEngineLoad(l: LoadListener): () => void {
  loadListeners.add(l);
  l(loadFraction);
  return () => loadListeners.delete(l);
}
