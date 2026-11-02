# Mindboard

Blindfold chess trainer. `BUILD_PLAN.md` is the spec and the record of what's built; `CLAUDE.md` has the working rules; `docs/CRITIQUE.md` is the self-audit with the status of each point.

## Running it

Node lives in `~/.local/node/bin`. It's on PATH in login shells (`~/.zprofile`); for every new Terminal tab, add it to `~/.zshrc` too:

```bash
echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.zshrc
```

```bash
npm run dev      # http://localhost:5173
npm run check    # typecheck + lint + tests (what CI runs, minus the build)
npm run build    # typecheck + production PWA build
```

Add `?profile=test` to the URL (e.g. `http://localhost:5173/?profile=test#/`) to use a separate save, so trying things out never touches your real progress. Microphone access needs a secure context: localhost is fine; on a phone over Wi-Fi use HTTPS.

## Scripts

```bash
npx vite-node scripts/calibrate.ts 200 6          # measure engine strength → docs/engine-calibration.json (~10 min)
npx vite-node scripts/build-content.ts <data-dir> # rebuild src/content from Lichess data
```

`build-content.ts` expects, in `<data-dir>`: `a.tsv`…`e.tsv` from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), a monthly `games-*.pgn.zst` and the start of `lichess_db_puzzle.csv.zst` (saved as `puzzles-part.csv.zst`) from [database.lichess.org](https://database.lichess.org). The current content used January 2013 and the first 30 MB of the puzzle file.

## Licences

- **Lichess data** (openings, games, puzzles) is public domain (CC0).
- **Stockfish** is GPLv3. That's fine for personal use and for a web app whose source is public. Distributing a closed-source build (e.g. an App Store app) would put the whole app under GPL obligations, so decide this before Phase 5.
