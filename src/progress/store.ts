// Progress persistence (IndexedDB via idb-keyval), the React hooks screens use
// to read and update it, cross-tab sync, and export/import.
//
// Profiles: adding ?profile=NAME to the URL keeps a separate save, so test
// runs and demos never touch your real progress.

import { useCallback, useEffect, useState } from 'react';
import { get, set } from 'idb-keyval';
import { migrate, readLegacyPrefs } from './migrate';
import { type Prefs, type Progress, emptyProgress, withPrefs } from './progress';

const LEGACY_KEY = 'mindboard.progress.v1';

/** The profile named in the URL, or null for your real save. */
export function currentProfile(search = typeof location === 'undefined' ? '' : location.search): string | null {
  const name = new URLSearchParams(search).get('profile');
  return name && /^[\w-]{1,32}$/.test(name) ? name : null;
}

function storeKey(): string {
  const profile = currentProfile();
  return profile ? `mindboard.progress.profile.${profile}` : 'mindboard.progress';
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export async function loadProgress(): Promise<Progress> {
  try {
    const key = storeKey();
    let saved = await get(key);
    // Your real save may still be under the old key from before v2.
    if (saved === undefined && !currentProfile()) saved = await get(LEGACY_KEY);
    const p = migrate(saved, currentProfile() ? {} : readLegacyPrefs(safeLocalStorage()));
    if (p) return p;
    console.warn('Saved progress was unreadable; starting fresh.');
  } catch (e) {
    console.warn('Could not load progress', e);
  }
  return emptyProgress();
}

export async function saveProgress(p: Progress): Promise<void> {
  try {
    await set(storeKey(), p);
  } catch (e) {
    console.warn('Could not save progress', e);
  }
}

/** Shared in-memory copy so every screen sees the same progress. */
let current: Progress | null = null;
const listeners = new Set<(p: Progress) => void>();
const publish = (p: Progress) => {
  current = p;
  listeners.forEach((l) => l(p));
};

// Other tabs announce their saves here; we adopt them instead of overwriting.
const channel: BroadcastChannel | null =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`mindboard:${storeKey()}`);
channel?.addEventListener('message', (e: MessageEvent) => {
  const p = migrate(e.data);
  if (p && current) publish(p);
});
// Coming back to a tab: pick up anything another tab or window saved meanwhile.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && current) void loadProgress().then(publish);
  });
}

function commit(p: Progress) {
  publish(p);
  void saveProgress(p);
  channel?.postMessage(p);
}

export function useProgress(): { progress: Progress | null; update: (fn: (p: Progress) => Progress) => void } {
  const [progress, setProgress] = useState<Progress | null>(current);

  useEffect(() => {
    listeners.add(setProgress);
    if (!current) {
      loadProgress().then((p) => {
        if (!current) publish(p);
        else setProgress(current);
      });
    }
    return () => {
      listeners.delete(setProgress);
    };
  }, []);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    if (current) commit(fn(current));
  }, []);

  return { progress, update };
}

/** One setting, with its default until progress has loaded. */
export function usePref<K extends keyof Prefs>(key: K): [Prefs[K], (v: Prefs[K]) => void] {
  const { progress, update } = useProgress();
  const value = (progress ?? emptyProgress()).prefs[key];
  const setValue = useCallback((v: Prefs[K]) => update((p) => withPrefs(p, { [key]: v } as Partial<Prefs>)), [update, key]);
  return [value, setValue];
}

/** Wipe all progress (used by the reset button on the Journey screen). Settings stay. */
export async function resetProgress(): Promise<void> {
  commit({ ...emptyProgress(), prefs: current?.prefs ?? emptyProgress().prefs });
}

/** Your whole save as a JSON file's text. */
export function exportProgress(p: Progress): string {
  return JSON.stringify({ app: 'mindboard', exportedAt: new Date().toISOString(), ...p }, null, 1);
}

/** Replace your save with an exported file. Returns an error message, or null on success. */
export function importProgress(text: string): string | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return "That file isn't valid JSON.";
  }
  if (typeof raw !== 'object' || raw === null || (raw as { app?: unknown }).app !== 'mindboard') return "That isn't a Mindboard backup.";
  const p = migrate(raw);
  if (!p) return 'That backup is from a version of Mindboard this one can’t read.';
  commit(p);
  return null;
}

/** For tests: forget the in-memory copy. */
export function _resetStoreForTests() {
  current = null;
}
