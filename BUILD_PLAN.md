# Mindboard: blindfold chess trainer (build plan for Claude Code)

"Mindboard" is a working name. The storyboard canvas shows 11 screens plus a roadmap. Match its look:
- Ground #0E0F12, surface #17191E, line #2A2E37, text #ECEDEF, muted #9AA0AB
- Accent lime #C6F432 (target, correct, primary button), amber #FFB547 (warning, blunder, streak), coral #E86A5B (attacker)
- Board squares: light #8E97A8, dark #59627A. Space Grotesk for UI text, JetBrains Mono for every square and move.

## The product in one line
You start by learning the board one square at a time. Then the board fades away in steps. You finish by playing full games with headphones in and your eyes closed: you say your moves, and an engine warns you before you blunder.

## Stack (start simple, keep the door open for native)
- **React + TypeScript + Vite**, shipped as a **PWA** so it runs on the phone from day one.
- **chess.js** handles rules, legal moves, SAN/FEN and game state.
- **Stockfish (WASM build, npm `stockfish`) in a Web Worker** plays as the opponent (strength-limited) and checks for blunders.
- **Speech:** start with the Web Speech API (`SpeechRecognition` and `speechSynthesis`) to prototype. Browser support is uneven, and iOS Safari in particular is unreliable, so wrap it behind an interface. Later you can swap in native speech (Capacitor/Expo) or a cloud speech-to-text service without touching game logic.
- **Storage:** IndexedDB (e.g. `idb-keyval`) for progress, square stats and game history. No backend until Phase 5.
- **Styling:** Tailwind or CSS modules; take the colour tokens above as CSS variables.

## Core architecture
```
src/
  board/        Board.tsx — props: fen, orientation, hidden(sq|piece→'show'|'ghost'|'gone'),
                highlights{sq:'target'|'from'|'warn'|'attacker'}, marks{sq:text}, showLabels, onTap(sq)
  chess/        game.ts (chess.js wrapper), san.ts (forgiving parser), spoken.ts (move ↔ words)
  engine/       stockfish.worker.ts, engine.ts (evaluate(fen), bestMove(fen, elo), analyseMove)
  voice/        Recogniser interface, WebSpeechRecogniser, Speaker (TTS), moveMatcher.ts
  drills/       squareName, squareTap, writeMove, readMove; adaptive queue
  levels/       ladder.ts — data-driven level definitions
  progress/     store.ts — square stats, level progress, slips, streak
  screens/      Journey, Drill, FogGame, VoiceGame, BlunderSheet, Review
```

**The single most important component is `Board`.** Every stage reuses it with different `hidden`, `highlights`, `orientation` and `showLabels` settings, so build it first and test it hard.

## The level ladder (data, not code)
Each level is a config object, e.g.
```ts
{ id: 'fog-14', stage: 3, mode: 'game', side: 'white', engineElo: 1400,
  hide: { own: { count: 4, pick: 'random-nonpawn' }, opp: 'none' },
  labels: true, peeks: 3, recallChecks: { every: [4, 7] }, input: ['type','voice'],
  pass: { result: 'not-loss', maxSlips: 3 } }
```
| Stage | Levels | What's hidden / asked |
|---|---|---|
| 1 Learn the board | Name square → tap square → as Black → labels off → timed | Empty board, one lit square |
| 2 Moves & notation | Write the move → read the move → captures/checks/castling/promo → knight paths → "what does it attack?" | Real opening positions, both colours |
| 3 Fade the board | Fog (N own pieces) → Pawnless → Ghost army (all own) → Dark board (last move tiles only) | Engine games |
| 4 Full blindfold | Move list only → nothing → voice-only | Engine games |
| 5 Headphones | Screen off, voice in/out, blunder guard | Engine games |

Make it adaptive: if you miss two recall checks in a row, the game drops back one fog level. If you pass three games in a row, it offers the next level.

## Drill engine (Stages 1–2)
- Track **accuracy and median response time for each square, separately for each orientation**. Store it in a 64×2 table.
- Choose the next question by weight: weak and slow squares come up more often, and a missed square is re-queued 3–5 questions later (simple spaced repetition).
- Move questions are drawn from a small bank of opening lines (Italian, Ruy Lopez, QGD, Sicilian, Nimzo, London). The positions look real and the moves are always legal.

## Voice: how to make it actually work
This decides whether the app feels magic or broken.
1. **Don't free-parse.** In any position there are only ~20–40 legal moves. Turn each one into its spoken forms ("knight f3", "knight to f three", "Nf3", "horse f3", "castle short", "king side castle", "e takes d5", "pawn takes d5", "queen takes on f3").
2. Take the recogniser's **top N alternatives**. Normalise the homophones ("see"→c, "be/bee"→b, "for/four"→4, "ate/eight"→8, "night"→knight, "won/one"→1, "too/to/two" depending on context). Then **fuzzy-match against that legal-move list only**.
3. Confidence gate: one clear match plays after a 1.5s read-back ("Queen takes f3", say "no" to cancel). If two or more candidates are close, it asks "Did you mean knight to d4 or knight to b5?"
4. Commands: "repeat", "where is my [piece]", "list my pieces", "what's on [square]", "take back", "resign". Limit the board-query commands per level.
5. **Audio out:** speak the opponent's move in full words ("Black plays bishop takes knight on f three"). Use media-key or earbud-tap to repeat the last move if the platform allows.

## Blunder guard (engine)
- Before your move, get the engine's eval and best move. After your move, get the eval again from your side.
- Trigger when **the eval drops by ≥ 200 centipawns** (this should be a setting) **and** the position wasn't already lost, or when the move allows mate.
- Explain why: find the opponent's refutation (its best reply) and describe it ("the knight on c6 takes back").
- On a mini board, **reveal only the pieces involved**: your moved piece, the attacker, and the target.
- **Did you mean:** offer legal moves that sound like what you said (same destination with a different piece, the same piece to a neighbouring square, files commonly confused by speech such as b/d/e) plus the engine's top move.
- **Spot visualisation slips (the blindfold-specific bit):**
  - If you try an illegal move, check whether it would be legal with one of your pieces back on a square it used to occupy. If so, say: "Your bishop left c4 on move 11, it's on e2."
  - If you pick "I thought c6 was empty", record it in the slip log.
- Every slip is saved with the move number and the square, and fed back into drills.

## Phases (each one is playable on its own)

### Phase 0 — Board engine
- Vite + React + TS + PWA scaffold, design tokens, `Board` component with every prop above, a storybook-style gallery page that recreates the canvas boards.
- **Done when:** any FEN renders from either side with any combination of hidden, ghosted or lit squares, labels on or off. Unit tests cover orientation (e.g. g3 on Black's view sits where b6 sits on White's).

### Phase 1 — Notation trainer (MVP)
- Journey screen, and four drill types (name square, tap square, write move with custom notation keyboard, read move + bonus question).
- Square stats, adaptive queue, streaks, the level ladder for Stages 1–2.
- **Done when:** you can climb 10 levels, and the Journey screen shows your weakest squares.

### Phase 2 — Fade the board
- Stockfish worker, strength control, fog game screen, hidden-piece rules per level, recall checks, peeks, typed SAN input (forgiving: `nf3`, `Nf3`, `g1f3`, `0-0`).
- **Done when:** you can finish a game with zero pieces shown.

### Phase 3 — Headphones mode
- `Recogniser` interface plus a Web Speech version, the move matcher above, text-to-speech read-back, cancel window, voice commands, a screen-off friendly UI.
- Build a test harness that prints the recogniser alternatives and match scores, so recognition can be tuned.
- **Done when:** 20 moves in a row are recognised hands-free with headphones.

### Phase 4 — Blunder guard + review
- Before/after eval, the trigger, the explanation, the mini-board reveal, did-you-mean, slip detection, post-game review with "drill my slips".
- **Done when:** it fires on hung pieces and allowed mates, and stays quiet on ordinary moves in a 10-game test.

### Phase 5 — Ship
- Capacitor or Expo wrapper for native speech recognition with contextual hints and background audio. Accounts and sync, a rated voice ladder, store builds.

## First prompt to give Claude Code
> Read BUILD_PLAN.md. Build Phase 0 only: scaffold a Vite + React + TypeScript PWA with the colour tokens and fonts, implement `Board` exactly as specified (fen, orientation, hidden, highlights, marks, showLabels, onTap), and a gallery page that renders these cases: empty board with f6 marked "?"; Black's view with labels off, b6 warn and g3 target; the Italian position after 4…Nf6 with c4/f3/d1/a1 ghosted; the same position with every white piece gone; an empty dark board with c8 → g4 lit. Add unit tests for orientation and square mapping. Stop when tests pass and show me the gallery.

Then do one phase per session: "Build Phase 1 from BUILD_PLAN.md", and so on.
