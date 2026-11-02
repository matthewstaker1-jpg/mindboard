# Mindboard: self-audit (2026-11-02)

A deliberately harsh list of what's wrong with the app as it stands after the
Phase 2 follow-ups (hold-to-peek, fade-as-they-move, Study and continue,
Follow the moves, Today, lost-track detection, voice). Nothing here has been
fixed yet; this is the list to work from. Most important first within each
section; the overall top ten is at the bottom.

## Does it actually teach blindfold chess?

1. **Engine ratings are invented.** "≈800", "≈1200" are labels on settings I
   chose, not measurements. Below 1320 the engine is Skill 0 at depth 1–3 plus
   a chance of playing one of its top-4 moves; nobody has checked what rating
   that really plays at. The adaptive offset (±40 per game, ±400 cap) is one
   number shared by every level, so a loss on Full blindfold makes Fog 2 easier.
2. **The ladder is slow and grindy.** 13 drill levels before any game, then
   each game level needs *three passing games in a row* (not lost, ≤3 slips).
   That's 27+ full games to reach Full blindfold, which contradicts the
   "short sessions" direction. There's no placement test or way to skip.
3. **Small, repeating content.** Study middlegames are the final positions of
   the 13 opening lines; Follow the moves reads those same 13 lines. A regular
   user will have them memorised within a couple of weeks, at which point
   they're testing recall of the line, not visualisation.
4. **"Hold the position" is judged by a noisy engine.** Lite Stockfish at depth
   12 comparing start vs end eval with a 150 cp tolerance: a 1000-rated player
   against a ~1000 engine will pass or fail partly by luck.
5. **Weak-square stats are muddied.** Slips are written into the square stats
   as a fake 4-second miss, so "can't name f6" and "lost track of my bishop on
   f6" become the same number, and median times get skewed.
6. **No spaced repetition across days.** Re-queueing only happens inside a
   session; yesterday's misses don't come back today on purpose.
7. **Recall checks are off, so the adaptive drop-back is dead code.** The
   spec's "miss two in a row and the fog steps back" no longer happens anywhere.
8. **Follow the moves only asks two question types** ("where is", "what's on").
   No "is e5 attacked?", "can the knight take?", "is it check?" — the questions
   that actually matter in a game.
9. **Endgame goals may be too hard blind for a 1000 player** (K+R vs K in 30
   moves with your pieces invisible), with no hint or easier variant.

## Correctness and chess details

10. **Misclicks cost a slip with no undo.** Clicking a wrong square in fog mode
    records a slip immediately; Take back also counts as a slip.
11. **Drag can't move hidden pieces**, only click-then-click. Inconsistent with
    visible pieces, and not explained on screen.
12. **Promotion by drag is always a queen**; under-promotion only by typing.
13. **Lost-track detection is narrow.** It only finds a single piece displaced
    from its most recent departure square. It doesn't cover "I thought c6 was
    empty" (in the spec), confusion with an opponent's piece, or two pieces mixed up.
14. **The engine has no timeout.** If the worker hangs, the game waits forever.
    First load downloads ~7 MB with no progress indicator.
15. **Post-game review is slow on long games** (one depth-10 search per ply, in
    series) and shares the single engine worker, so starting a new game while
    it runs queues behind it.
16. **The "engine mistakes" model is unvalidated**: picking uniformly among the
    top 4 at depth 1 can produce bizarre blunders or still be too strong.

## Voice (Phase 3)

17. **Never tested with a real microphone.** The matcher is unit-tested and the
    lab works with typed phrases, but Phase 3's "done when" (20 spoken moves in
    a row, hands-free) has not been attempted.
18. **Web Speech is Chrome-first** and sends audio to Google's servers: it needs
    a network connection (so "works offline" is false for voice) and has privacy
    implications. Safari is partial; iOS web is poor.
19. **Speaker echo.** Without headphones the recogniser can hear the app's own
    read-back after the speaking guard ends.
20. **Thresholds and homophones are guesses** (0.75 confident, 0.12 margin,
    hand-written sound-alike list); not tuned on real speech or accents.
21. **Headphones mode can't really work on a phone browser**: locking the screen
    suspends the page's audio and recognition. No media-key or earbud-tap support.

## UX and UI

22. **No onboarding.** First launch drops you on a long Journey page with 22
    levels and no explanation of the method, slips, peeks, or what to do first.
23. **Journey is cluttered**: Today, current level, weakest squares, Practice and
    a 22-item path on one scroll.
24. **Desktop layout wastes the screen**: a phone-width column centred on a
    laptop; the board is capped at half the window height.
25. **Jargon.** "Slip", "Level 14" (numbering runs across stages), "≈1000",
    "passing games in a row" are never explained.
26. **The coordinates switch is a tiny "a1" pill**; its meaning isn't obvious.
27. **Locked levels are reachable by URL**: the lock is only on the Journey links.
28. **Storyboard features missing**: clocks, bottom navigation, XP, the "Where
    is…? questions 2 left" counter (replaced by the peek budget).
29. **Accessibility**: the board can't be operated by keyboard for moves;
    highlights rely on colour (lime/amber/coral) alone; labels are 9px.

## Data and progress

30. **Test runs polluted the saved progress.** Automated browser checks during
    development passed drill levels, recorded dark-board games, moved the engine
    offset and shortened Follow the moves in the same browser profile.
31. **Two open tabs overwrite each other** (each keeps its own in-memory copy;
    the last save wins).
32. **No export, backup or sync.** Clearing site data loses everything; the Mac
    and a phone would be separate. Preferences are scattered across
    localStorage keys while progress is in IndexedDB.
33. **Schema "version 1" has grown without migrations**; old saves are patched by
    merging defaults, with no validation.

## Engineering

34. **FogGame.tsx does too much** (~600 lines: study phase, peeking, engine
    loop, goals, results, review hook-up) with many loosely coupled `useState`s
    and effects; it should be a reducer or state machine split into parts.
35. **No ESLint is installed**, though the code has `eslint-disable` comments.
36. **No screen-level tests and no end-to-end tests.** Only logic is
    unit-tested; the browser checks were ad-hoc scripts that aren't in the repo.
37. **No CI** on GitHub; tests only run when someone runs them.
38. **Hard-coded colours outside the tokens** (`#6f7682`, `#3a3f4a`, `#221a10`, …)
    spread across CSS files.
39. **PWA icon is SVG only**: iOS wants a PNG apple-touch-icon; no maskable icon.
40. **Stockfish is GPLv3.** Fine for personal use; distributing the app (App
    Store) means GPL obligations for the whole app.
41. **Docs have drifted from reality.** BUILD_PLAN.md still describes the
    pre-move blunder guard, recall checks and peek counts; CLAUDE.md says "one
    phase at a time", which this work didn't follow.
42. **Local setup is half done**: Node lives in `~/.local/node` and is on PATH
    only in `~/.zprofile`, so a normal Terminal tab can't run `npm`.

## Top ten to fix first

1. Measure the engine's real strength at each setting and make the adaptive offset per level (1, 16).
2. Shorten the ladder: placement test, and pass game levels on 2 of 3 (or a points system) (2).
3. Much more content: a few hundred real positions/lines from master games for Study and Follow (3).
4. Real-microphone test of voice in Chrome, then tune thresholds with the Voice lab (17, 20).
5. Onboarding and a plain-language glossary (22, 25).
6. Separate "lost track" stats from square-naming stats; cross-day spaced repetition (5, 6).
7. A misclick grace (confirm or free undo within a second) (10).
8. Engine timeout and loading progress (14).
9. Split FogGame into a reducer and smaller components; add ESLint and CI (34–37).
10. Update BUILD_PLAN.md to match what was actually built (41).
