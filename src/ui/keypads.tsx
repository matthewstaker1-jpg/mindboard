import { useEffect, useRef, useState } from 'react';
import { FILES, type Square } from '../board/squares';
import './keypads.css';

const RANK_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/** Run `handler` for physical key presses while `active`. Ignores modified keys. */
export function useKeys(active: boolean, handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      ref.current(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [active]);
}

/** File row + rank row. Picks a square once both halves are chosen; also takes typed "f6". */
export function SquareKeypad({ onSquare, disabled }: { onSquare: (sq: Square) => void; disabled?: boolean }) {
  const [file, setFile] = useState<string | null>(null);
  const [rank, setRank] = useState<string | null>(null);
  // Mirrors the state so two keys pressed within one render both count.
  const pending = useRef<{ f: string | null; r: string | null }>({ f: null, r: null });

  const pick = (f: string | null, r: string | null) => {
    if (f && r) {
      pending.current = { f: null, r: null };
      setFile(null);
      setRank(null);
      onSquare(`${f}${r}` as Square);
    } else {
      pending.current = { f, r };
      setFile(f);
      setRank(r);
    }
  };

  useKeys(!disabled, (e) => {
    const { f, r } = pending.current;
    if ((FILES as readonly string[]).includes(e.key)) pick(e.key, r);
    else if (RANK_KEYS.includes(e.key)) pick(f, e.key);
    else if (e.key === 'Backspace' || e.key === 'Escape') pick(null, null);
    else return;
    e.preventDefault();
  });

  return (
    <div className="keypad">
      <div className="answer-field" aria-live="polite">
        <span>{file ?? ''}</span>
        <span>{rank ?? ''}</span>
        {!(file && rank) && <span className="answer-field__cursor" />}
      </div>
      <div className="keypad__row keypad__row--8">
        {FILES.map((f) => (
          <button key={f} type="button" className="key" data-on={f === file || undefined} disabled={disabled} onClick={() => pick(f, pending.current.r)}>
            {f}
          </button>
        ))}
      </div>
      <div className="keypad__row keypad__row--8">
        {RANK_KEYS.map((r) => (
          <button key={r} type="button" className="key" data-on={r === rank || undefined} disabled={disabled} onClick={() => pick(pending.current.f, r)}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

const PIECE_KEYS = ['K', 'Q', 'R', 'B', 'N', 'x'];

/** The custom notation keyboard for writing moves. Also accepts typing on a real keyboard. */
export function NotationKeyboard({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}) {
  // Mirrors `value` so fast typing within one render isn't lost.
  const latest = useRef(value);
  latest.current = value;
  const set = (v: string) => {
    latest.current = v;
    onChange(v);
  };
  const add = (s: string) => set((latest.current + s).slice(0, 10));
  const back = () => set(latest.current.slice(0, -1));

  useKeys(!disabled, (e) => {
    const k = e.key;
    if (k === 'Enter') {
      if (latest.current) onSubmit(latest.current);
    }
    else if (k === 'Backspace') back();
    else if (/^[KQRBNa-hx1-8=+#-]$/.test(k)) add(k);
    else if (k === 'O' || k === 'o' || k === '0') add('O');
    else return;
    e.preventDefault();
  });

  return (
    <div className="keypad">
      <div className="answer-field" aria-live="polite">
        <span>{value}</span>
        <span className="answer-field__cursor" />
      </div>
      <div className="keypad__row keypad__row--6">
        {PIECE_KEYS.map((k) => (
          <button key={k} type="button" className="key" disabled={disabled} onClick={() => add(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="keypad__row keypad__row--8">
        {FILES.map((f) => (
          <button key={f} type="button" className="key" disabled={disabled} onClick={() => add(f)}>
            {f}
          </button>
        ))}
      </div>
      <div className="keypad__row keypad__row--8">
        {RANK_KEYS.map((r) => (
          <button key={r} type="button" className="key" disabled={disabled} onClick={() => add(r)}>
            {r}
          </button>
        ))}
      </div>
      <div className="keypad__row keypad__row--6">
        <button type="button" className="key key--small" disabled={disabled} onClick={() => add('O-O')}>
          O-O
        </button>
        <button type="button" className="key key--small" disabled={disabled} onClick={() => add('O-O-O')}>
          O-O-O
        </button>
        <button type="button" className="key" disabled={disabled} onClick={() => add('=')}>
          =
        </button>
        <button type="button" className="key" disabled={disabled} onClick={() => add('+')}>
          +
        </button>
        <button type="button" className="key" aria-label="Delete" disabled={disabled} onClick={back}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
            <path d="M18 9l-6 6M12 9l6 6" />
          </svg>
        </button>
        <button type="button" className="key key--primary" disabled={disabled || !value} onClick={() => onSubmit(latest.current)}>
          Check
        </button>
      </div>
    </div>
  );
}
