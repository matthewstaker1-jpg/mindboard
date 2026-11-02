import { describe, expect, it } from 'vitest';
import { migrate, readLegacyPrefs } from './migrate';
import { PROGRESS_VERSION, emptyProgress } from './progress';
import { currentProfile } from './store';

const v1 = {
  version: 1,
  stats: { white: { e4: { seen: 3, correct: 2, times: [1000, 2000, 'x'] } }, black: {} },
  levels: { 'name-square': { attempts: 2, passed: true, best: { correct: 20, total: 20, medianMs: 900 } } },
  streak: { days: 4, lastDay: '2026-11-01' },
  bestRun: 12,
  engineOffset: -200,
  study: { played: 3, passed: 1 },
  follow: { plies: 10, rounds: 2, perfect: 1 },
  todayDone: '2026-11-01',
};

describe('migrate', () => {
  it('keeps the moved-on mark and ignores anything that is not true', () => {
    const base = { ...emptyProgress(), levels: { a: { attempts: 1, passed: false, best: null, movedOn: true }, b: { attempts: 1, passed: false, best: null, movedOn: 'yes' } } };
    const p = migrate(base)!;
    expect(p.levels.a!.movedOn).toBe(true);
    expect(p.levels.b!.movedOn).toBeUndefined();
  });

  it('gives fresh progress when nothing is saved', () => {
    expect(migrate(undefined)).toEqual(emptyProgress());
  });

  it('upgrades a v1 save, keeping levels and stats and dropping the shared engine offset', () => {
    const p = migrate(v1, { coords: false, onboarded: true })!;
    expect(p.version).toBe(PROGRESS_VERSION);
    expect(p.levels['name-square']).toMatchObject({ passed: true, attempts: 2 });
    expect(p.stats.white.e4).toEqual({ seen: 3, correct: 2, times: [1000, 2000] });
    expect(p.stats.black.a1).toEqual({ seen: 0, correct: 0, times: [] });
    expect(p.engineOffsets).toEqual({});
    expect(p.prefs.coords).toBe(false);
    expect(p.prefs.onboarded).toBe(true);
    expect(p.streak).toEqual({ days: 4, lastDay: '2026-11-01' });
  });

  it('repairs bad fields instead of failing', () => {
    const p = migrate({ ...emptyProgress(), bestRun: 'lots', streak: { days: 2, lastDay: 'yesterday' }, follow: { plies: 999 } })!;
    expect(p.bestRun).toBe(0);
    expect(p.streak.lastDay).toBeNull();
    expect(p.follow.plies).toBe(30);
  });

  it('refuses things that are not a save, or from a newer version', () => {
    expect(migrate('hello')).toBeNull();
    expect(migrate({ foo: 1 })).toBeNull();
    expect(migrate({ version: 99 })).toBeNull();
  });

  it('reads old localStorage settings', () => {
    const store: Record<string, string> = { 'mindboard.coords': 'off', 'mindboard.study': '{"kind":"endgame","hide":"all"}' };
    const prefs = readLegacyPrefs({ getItem: (k) => store[k] ?? null });
    expect(migrate(v1, prefs)!.prefs).toMatchObject({ coords: false, study: { kind: 'endgame', hide: 'all' } });
  });
});

describe('profiles', () => {
  it('reads a safe profile name from the URL', () => {
    expect(currentProfile('?profile=test')).toBe('test');
    expect(currentProfile('')).toBeNull();
    expect(currentProfile('?profile=../../x')).toBeNull();
  });
});
