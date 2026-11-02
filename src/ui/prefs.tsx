import { usePref } from '../progress/store';
import './prefs.css';

/** Your own coordinates switch: when off, boards hide letters and numbers even on levels that allow them. */
export function useCoordsPref(): [boolean, (v: boolean) => void] {
  return usePref('coords');
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
