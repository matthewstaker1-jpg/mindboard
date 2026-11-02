# Mindboard: blindfold chess trainer (build plan)

"Mindboard" is a working name. This file is the spec **and** a record of what's built: each section says what exists now, and the Phases list says what's done and what's left. `docs/CRITIQUE.md` holds the self-audit and the status of each point.

Look (from the storyboard in `design/screens`):
- Ground #0E0F12, surface #17191E, line #2A2E37, text #ECEDEF, muted #9AA0AB
- Accent lime #C6F432 (target, correct, primary button), amber #FFB547 (warning, blunder, streak), coral #E86A5B (attacker)
- Board squares: light #8E97A8, dark #59627A. Space Grotesk for UI text, JetBrains Mono for every square and move.
- All colours are tokens in `src/styles/tokens.css`; CSS files use `var(--…)` only.

## The product in one line
You start by learning the board one square at a time. Then the board fades away in steps. You finish by playing full games with your eyes closed: you hear the moves and say (or type) yours.

## Stack
- **React 18 + TypeScript + Vite**, shipped as a **PWA** (vite-plugin-pwa): works offline once loaded, installable, PNG + maskable + Apple icons.
- **chess.js** for rules, SAN/FEN and game state.
- **Stockfish 17.1 lite single-threaded (WASM, npm `stockfish`) in a Web Worker**, copied to `public/engine` by `scripts/copy-engine.mjs`. GPLv3: see README.
- **Speech:** Web Speech API behind `Recogniser`/`Speaker` (`src/voice`). Recognition is Chrome-only and online (audio goes to Google); speech output uses the device's own voices and works offline.
- **Storage:** IndexedDB (`idb-keyval`), one versioned document per profile holding progress *and* settings. No backend.
- **Plain CSS** per screen with the tokens above.
- **Tooling:** Vitest + Testing Library (unit and screen tests), ESLint (flat config, typescript-eslint, react-hooks), GitHub Actions CI running typecheck, lint, tests and build.

## Architecture (as built)
```
src/
  board/      Board.tsx: fen, orientation, hidden(sq|piece → show|ghost|gone), highlights, marks,
              showLabels, onTap, onMove (drag or click-click, hidden pieces too), canDrag, canSelect, tone
  chess/      game.ts (opening move bank), san.ts (forgiving parser), spoken.ts (move → words),
              openings.ts (hand-written lines), positions.ts (Study positions)
  content/    Lichess-derived lines, middlegames and puzzles (built by scripts/build-content.ts), lazy-loaded
  engine/     engine.ts: Engine (UCI over a worker, serialised, 15s timeout + restart), strengthFor
              (measured settings), getEngine (play) / getReviewEngine (post-game review), preloadEngine
  voice/      recogniser.ts (Web Speech), moveMatcher.ts (legal-move matching), commands.ts
  drills/     questions.ts, session.ts, queue.ts (adaptive + due-square boost), follow.ts (Follow the moves)
  game/       fogGame.ts (rules: hiding, slips, lost-track, goals, take-backs, recall checks),
              screenState.ts (game screen reducer), review.ts (biggest mistakes)
  levels/     ladder.ts (Stages 1–2), games.ts (Stages 3–4), placement.ts, all.ts
  progress/   progress.ts (pure updates), stats.ts, migrate.ts (versioned save + validation), store.ts
              (IndexedDB, profiles, cross-tab sync, backup/restore, usePref)
  screens/    Journey, Today, Drill, FogGame (+ game/: useFogGame, parts, GameResult), Study, FollowMoves,
              Placement, Settings, Help, GameReview, VoicePanel, VoiceLab
scripts/      copy-engine.mjs, calibrate.ts (engine strength), build-content.ts (Lichess data)
```
Chess logic stays out of React components; screens call pure functions and the `screenState` reducer.

## The level ladder (data, not code)
22 levels in four stages, numbered within each stage ("Level 3 of 7"). A placement test can skip Stages 1–2.

| Stage | Levels | Pass rule |
|---|---|---|
| 1 Learn the board (7) | Name / find square from White, from Black, labels off; Against the clock | Accuracy, plus a median time on the clock level |
| 2 Moves & notation (6) | Write the move, captures & checks, read the move, castling & promotion, knight paths, mixed review | Accuracy |

**Move on anyway** (drill levels): within 15 points of the pass mark (15/20 on a 90% level, 70% on an 85% one; speed ignored), you can go on to the next level. The level is marked *come back*: its drill kinds join Today's warm-up (+2 questions each, up to 20) until you pass it, and the ladder isn't finished while any remain.
| 3 Fade the board (7) | Fade as they move, Fog 2 / 4 / 6, Pawnless, Ghost army, Dark board (last move only) | 2 of your last 3 games count |
| 4 Full blindfold (2) | Move list only, Full blindfold | 2 of your last 3 games count |

A game **counts** if you don't lose and make at most 3 slips. Recall checks are an opt-in setting; when on, missing two in a row drops the fog back a level for that game (and that game doesn't count).

**Placement test** (`levels/placement.ts`): 16 square questions (both sides, no labels). 85% skips the six board levels; also a median ≤ 5 s skips Against the clock. Only then come 12 move questions: 80% skips all of Stage 2.

## Engine strength (measured, not guessed)
`scripts/calibrate.ts` plays 200-game matches in Node with the same Stockfish build. It chains down from Stockfish's own `UCI_Elo 1320` (its limiter's floor) through the app's low settings. Results in `docs/engine-calibration.json`:

| Setting | Measured |
|---|---|
| depth 1, 50% chance of one of its top-4 other moves | 749 |
| depth 2, 32% | 894 |
| depth 3, 12% | 1048 |
| Stockfish `UCI_Elo` | 1320 and up |

Ratings are on Stockfish's scale (anchored to engine rating lists): a fair comparison between levels and a rough guide to human ratings. `strengthFor(target)` picks the nearest measured setting and the app shows its **measured** rating. Each game level has its own adaptive offset (±40 per win/loss, ±400 cap).

**Notation cheat sheet** (`screens/NotationSheet.tsx`): four click-through cards (piece and square; captures, check, mate; castling and promotion; telling two pieces apart). Shown once before your first Stage 2 drill, and always at `#/notation` (linked from Help and Stage 2 results). Write-the-move prompts name the piece a promoting pawn becomes.

## Drill engine (Stages 1–2)
- Accuracy and recent response times per square, separately for each orientation (64×2).
- The next question is weighted towards weak and slow squares. A missed question comes back 3–5 questions later in the same session.
- **Spaced repetition across days:** a missed square is due tomorrow, then after 3, 7, 16 and 30 days if answered right when due; due squares come up 4× as often.
- **Ears only** (setting): find-the-square, read-the-move and knight-path prompts are spoken, not shown, and the clock starts after the prompt is heard.

## Games (Stages 3–4) and Study
- Hiding rules: fog (N random non-pawn pieces), fade as they move, own pawns, all own, everything; views: board, dark board, move list only, nothing.
- Input: type (`nf3`, `Nf3`, `g1f3`, `0-0`), drag or click on the board (hidden pieces too), or voice. Board promotions ask which piece.
- **Slips:** illegal moves and moves of pieces that aren't there. Recognised visualisation slips are explained: a piece you moved earlier ("your knight left g1 on move 3; it's on f3"), something in the way ("the black knight on a5 is in the way"), or your own piece on the target square. Slips are stored as **lost-track stats per square**, separate from naming accuracy.
- **Misclick grace:** a wrong square on the board can be waved off for 3 s. **Take back:** the first per game is free; later ones are slips.
- **Peek:** hold the button or Space; some levels have a per-game budget.
- **Study and continue:** study a position, it fades (as they move / your pieces / everything), then play a goal. Positions: 400 middlegames from real Lichess games (hold for 8 moves: no more than 200 cp lost at depth 14, or finish above +3), 200 mate-in-2/3 puzzles, 100 pawn endings, plus hand-made basic endgames.
- **Post-game review** (on request, its own worker): the two moves that cost the most (≥ 200 cp), with the better move.

## Follow the moves
No board: hear or read a line, then answer three questions: where is a piece, what's on a square, and a yes/no question ("Is d5 attacked by Black?", "Can the knight on f3 take on e5?"). Lines come from 3,076 named openings and 600 real games between 1800+ players. The length adapts (4–30 plies).

## Voice
1. **Don't free-parse:** match the recogniser's alternatives against the spoken forms of the legal moves only (`voice/moveMatcher.ts`), after normalising homophones.
2. Confidence gate: one clear match is read back and played after 1.5 s unless you say "no". Close candidates are asked about.
3. Commands: repeat, where is my…, what's on…, list my pieces (these cost peek time), take back, resign.
4. Opponent moves are spoken in words. A 700 ms echo tail after speaking ignores the app hearing itself.
5. **Voice lab** shows every alternative and score, and downloads a tuning log (with the move you meant).

Known limits: Chrome only; needs a connection; audio goes to Google; a phone's locked screen suspends the page.

## Saves
- One document per profile, `version: 2`. `progress/migrate.ts` upgrades older versions step by step and validates every field.
- Settings live in the same document (so backups carry them).
- Tabs share saves over `BroadcastChannel` and reload when they become visible again.
- **Back up / Restore** (JSON) in Settings.
- `?profile=NAME` in the URL keeps a separate save: use it for tests and demos (e.g. `http://localhost:5173/?profile=test#/`).
- Locked levels stay locked from the address bar.

## Phases

### Phase 0 — Board engine ✅
Board with every prop, gallery page, orientation tests.

### Phase 1 — Notation trainer ✅
Journey, four drill types (+ knight paths), stats, adaptive queue, streaks, Stages 1–2.

### Phase 2 — Fade the board ✅
Stockfish worker, measured strength, fog games, hiding rules, peeks, typed input, Study and continue, Follow the moves, Today, placement test.

### Phase 3 — Headphones mode 🟡
Built: recogniser, matcher, read-back and cancel window, commands, Voice lab with a tuning log, Ears only.
**Not done:** the "done when": 20 spoken moves in a row hands-free with a real microphone. Thresholds (0.75 confidence, 0.12 margin) and sound-alikes still need tuning from real logs. No screen-off/background play on phones (browser limitation).

### Phase 4 — Blunder guard + review 🟡
Built: post-game review of the biggest mistakes; lost-track and blocked-move detection during play.
**Not done:** the *pre-move* blunder guard (warn before a ≥ 200 cp drop and offer did-you-mean), the mini-board reveal, "drill my slips".

### Phase 5 — Ship ⬜
Native wrapper (Capacitor/Expo) for on-device speech and background audio; sync between devices; store builds. Decide the Stockfish licence question first (see README).

Deliberately left out for now: clocks, bottom navigation and XP from the storyboard.
