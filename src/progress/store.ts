// Progress persistence (IndexedDB via idb-keyval) and the React hook that
// screens use to read and update it.

import { useCallback, useEffect, useState } from 'react';
import { get, set } from 'idb-keyval';
import { emptyProgress, type Progress } from './progress';
import { emptyStats } from './stats';

const KEY = 'mindboard.progress.v1';

export async function loadProgress(): Promise<Progress> {
  try {
    const saved = (await get(KEY)) as Progress | undefined;
    if (saved && saved.version === 1) {
      // Fill anything a newer build added, so older saves keep working.
      return { ...emptyProgress(), ...saved, stats: { ...emptyStats(), ...saved.stats } };
    }
  } catch (e) {
    console.warn('Could not load progress', e);
  }
  return emptyProgress();
}

export async function saveProgress(p: Progress): Promise<void> {
  try {
    await set(KEY, p);
  } catch (e) {
    console.warn('Could not save progress', e);
  }
}

/** Shared in-memory copy so every screen sees the same progress. */
let current: Progress | null = null;
const listeners = new Set<(p: Progress) => void>();

export function useProgress(): { progress: Progress | null; update: (fn: (p: Progress) => Progress) => void } {
  const [progress, setProgress] = useState<Progress | null>(current);

  useEffect(() => {
    listeners.add(setProgress);
    if (!current) {
      loadProgress().then((p) => {
        current ??= p;
        listeners.forEach((l) => l(current!));
      });
    }
    return () => {
      listeners.delete(setProgress);
    };
  }, []);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    if (!current) return;
    current = fn(current);
    listeners.forEach((l) => l(current!));
    void saveProgress(current);
  }, []);

  return { progress, update };
}

/** Wipe all progress (used by the reset button on the Journey screen). */
export async function resetProgress(): Promise<void> {
  current = emptyProgress();
  listeners.forEach((l) => l(current!));
  await saveProgress(current);
}
