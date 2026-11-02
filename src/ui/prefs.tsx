import { useCallback, useEffect, useState } from 'react';
import './prefs.css';

const KEY = 'mindboard.coords';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

const listeners = new Set<(v: boolean) => void>();

/** Your own coordinates switch: when off, boards hide letters and numbers even on levels that allow them. */
export function useCoordsPref(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(read);
  useEffect(() => {
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  const set = useCallback((v: boolean) => {
    try {
      localStorage.setItem(KEY, v ? 'on' : 'off');
    } catch {
      // Private mode etc.: the switch still works for this visit.
    }
    listeners.forEach((l) => l(v));
  }, []);
  return [on, set];
}

/** Small switch for the coordinates. Disabled (and shown off) when the level already hides them. */
export function CoordsToggle({ allowed }: { allowed: boolean }) {
  const [on, set] = useCoordsPref();
  const shown = allowed && on;
  return (
    <button
      type="button"
      className="coords-toggle"
      role="switch"
      aria-checked={shown}
      disabled={!allowed}
      title={allowed ? 'Show letters and numbers on the board' : 'This level hides coordinates'}
      onClick={() => set(!on)}
    >
      <span className="coords-toggle__label">a1</span>
      <span className="coords-toggle__track" data-on={shown || undefined}>
        <span className="coords-toggle__thumb" />
      </span>
    </button>
  );
}
