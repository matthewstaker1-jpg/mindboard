// Copies the Stockfish lite single-threaded build into public/engine so Vite
// serves it as-is (the engine finds its .wasm next to its .js by name).
// Single-threaded because the multi-threaded build needs cross-origin
// isolation headers that simple static hosts can't set.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const src = 'node_modules/stockfish/src';
const out = 'public/engine';
mkdirSync(out, { recursive: true });
const pick = (ext) => {
  const f = readdirSync(src).find((n) => /^stockfish-[\d.]+-lite-single-[0-9a-f]+\./.test(n) && n.endsWith(ext));
  if (!f) throw new Error(`No lite single-threaded Stockfish ${ext} in ${src}`);
  return f;
};
copyFileSync(join(src, pick('.js')), join(out, 'stockfish.js'));
copyFileSync(join(src, pick('.wasm')), join(out, 'stockfish.wasm'));
copyFileSync('node_modules/stockfish/Copying.txt', join(out, 'COPYING.txt'));
console.log('Stockfish copied to public/engine');
