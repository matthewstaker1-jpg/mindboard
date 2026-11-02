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
  /** The move you meant to say, when you filled it in: makes the log usable for tuning. */
  intended?: string;
  fen?: string;
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
  const [intended, setIntended] = useState('');
  // Everything heard this visit, for the downloadable tuning log (the list shows the latest 20).
  const [all, setAll] = useState<Entry[]>([]);
  const rec = useRef(new WebSpeechRecogniser());
  const meta = useRef({ intended, fen });
  meta.current = { intended, fen };

  useEffect(() => {
    const r = rec.current;
    r.onPhrase = (alts) => {
      const e: Entry = { at: new Date().toISOString(), alts, intended: meta.current.intended || undefined, fen: meta.current.fen };
      setLog((l) => [e, ...l].slice(0, 20));
      setAll((l) => [...l, e]);
    };
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
      <label className="lab__fen">
        <span>The move you're about to say (optional, for the log)</span>
        <input className="mono" value={intended} onChange={(e) => setIntended(e.target.value)} placeholder="e.g. Nf3" spellCheck={false} />
      </label>
      {all.length > 0 && (
        <div className="lab__row">
          <button type="button" className="btn" onClick={() => downloadLog(all)}>
            Download log ({all.length} phrase{all.length === 1 ? '' : 's'})
          </button>
        </div>
      )}
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

/** Save what was heard, with what was meant, so thresholds and sound-alikes can be tuned on real speech. */
function downloadLog(entries: Entry[]) {
  const rows = entries.map((e) => {
    const r = e.fen ? matchSpokenMove(e.alts, e.fen) : null;
    return { ...e, verdict: r?.kind, played: r?.kind === 'confident' ? r.move.san : undefined, top: r?.scored.slice(0, 3).map((x) => [x.move.san, +x.score.toFixed(3)]) };
  });
  const blob = new Blob([JSON.stringify({ app: 'mindboard-voice-log', userAgent: navigator.userAgent, entries: rows }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mindboard-voice-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
