# Mindboard — blindfold chess trainer

Read `BUILD_PLAN.md` before doing anything. It's the spec: stack, architecture, level ladder, voice matching, blunder guard, and phases.

## Design reference
- `design/screens/*.dc.html` are the storyboard screens. They're written in a canvas-tool format: treat them as a visual and layout reference (colours, spacing, copy, structure), not as code to import. The `buildBoard()` function in each one shows how hiding and highlighting map to square colours.
- `design/images/` (if present) holds exported pictures of the same screens. Match them closely.
- Colour tokens and fonts are listed at the top of `BUILD_PLAN.md`.

## How we work
- Build **one phase at a time**, in order. Don't start the next phase until the current one's "Done when" is met.
- Plan before coding, and show me the plan for any phase.
- Keep chess logic (chess.js, engine, move matching) out of React components so it can be unit tested.
- Write tests for the board's square/orientation mapping, the SAN parser, and the spoken-move matcher.
- Commit after each working step with a clear message. Run `npm run check` (typecheck, lint, tests) first; CI runs the same plus the build.
- Browser checks use a separate save: add `?profile=test` to the URL so test runs never touch real progress.
- Mic access needs a secure context: localhost is fine; testing on a phone over Wi-Fi needs HTTPS (e.g. vite-plugin-mkcert or a tunnel).
