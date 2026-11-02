import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { parseCommand } from '../voice/commands';
import { type Alternative, CONFIDENT, MARGIN, matchSpokenMove, normaliseSpoken } from '../voice/moveMatcher';
import { WebSpeechRecogniser } from '../voice/recogniser';
import './VoiceLab.css';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface Entry {
  at: string;
  alts: Alternative[];
}

/**
 * Test harness for tuning recognition: what the recogniser heard (all its
 * alternatives), how each was normalised, and how every legal move scored.
 */
export function VoiceLab() {
  const [fen, setFen] = useState(START);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<Entry[]>([]);
  const [typed, setTyped] = useState('');
  const rec = useRef(new WebSpeechRecogniser());

  useEffect(() => {
    const r = rec.current;
    r.onPhrase = (alts) => setLog((l) => [{ at: new Date().toLocaleTimeString(), alts }, ...l].slice(0, 20));
    r.onState = setListening;
    r.onError = setError;
    return () => r.stop();
  }, []);

  let valid = true;
  try {
    new Chess(fen);
  } catch {
    valid = false;
  }

  return (
    <div className="app lab">
      <header className="game__top">
        <a href="#/" className="icon-btn" aria-label="Back to journey">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </a>
        <span className="game__title">VOICE LAB</span>
        <span className="follow__spacer" />
      </header>
      <p className="muted">
        Say a move and see every alternative the recogniser heard, how it was read, and how the legal moves scored.
        Plays at ≥{CONFIDENT} with a {MARGIN} lead; otherwise it asks.
      </p>
      <label className="lab__fen">
        <span>Position (FEN)</span>
        <input className="mono" value={fen} onChange={(e) => setFen(e.target.value)} spellCheck={false} />
      </label>
      {!valid && <p className="game__msg game__msg--warn">That FEN isn't valid.</p>}
      <div className="lab__row">
        <button
          type="button"
          className={`btn ${listening ? 'btn--primary' : ''}`}
          disabled={!rec.current.supported}
          onClick={() => (listening ? rec.current.stop() : rec.current.start())}
        >
          {!rec.current.supported ? 'Speech recognition not available (try Chrome)' : listening ? 'Stop listening' : 'Start listening'}
        </button>
      </div>
      {error && <p className="game__msg game__msg--warn">{error}</p>}
      <form
        className="lab__row"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) setLog((l) => [{ at: 'typed', alts: [{ transcript: typed, confidence: 0.9 }] }, ...l]);
          setTyped('');
        }}
      >
        <input className="lab__typed" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type what you'd say, e.g. night see three" />
        <button type="submit" className="btn">
          Try
        </button>
      </form>
      {valid &&
        log.map((entry, i) => {
          const r = matchSpokenMove(entry.alts, fen);
          const cmd = entry.alts.map((a) => parseCommand(a.transcript)).find(Boolean);
          return (
            <section key={i} className="lab__entry">
              <div className="lab__head">
                <span className="mono muted">{entry.at}</span>
                <span className="lab__verdict" data-kind={cmd ? 'command' : r.kind}>
                  {cmd ? `command: ${cmd.kind}` : r.kind === 'confident' ? `plays ${r.move.san}` : r.kind === 'ask' ? `asks: ${r.options.map((m) => m.san).join(' / ')}` : 'no match'}
                </span>
              </div>
              <table className="lab__alts">
                <tbody>
                  {entry.alts.map((a, j) => (
                    <tr key={j}>
                      <td>“{a.transcript}”</td>
                      <td className="mono muted">{(a.confidence ?? 0).toFixed(2)}</td>
                      <td className="mono">→ {normaliseSpoken(a.transcript) || '∅'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="lab__scores mono">
                {r.scored.slice(0, 5).map((s) => (
                  <span key={s.move.lan}>
                    {s.move.san} {s.score.toFixed(2)}
                  </span>
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
