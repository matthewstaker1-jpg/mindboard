import { dayKey, type Progress } from '../progress/progress';
import { currentProfile, exportProgress, importProgress, resetProgress, usePref, useProgress } from '../progress/store';
import { Switch } from '../ui/prefs';
import { BackLink } from './game/parts';
import './Settings.css';

export function Settings() {
  const { progress } = useProgress();
  const [coords, setCoords] = usePref('coords');
  const [voice, setVoice] = usePref('voice');
  const [ears, setEars] = usePref('earsOnly');
  const [recall, setRecall] = usePref('recallChecks');

  return (
    <div className="app settings">
      <header className="game__top">
        <BackLink />
        <span className="game__title">SETTINGS</span>
        <a className="settings__help" href="#/help">
          Help
        </a>
      </header>

      <section>
        <p className="eyebrow">Training</p>
        <Switch
          label="Coordinates"
          hint="Letters and numbers along the board's edges, on levels that allow them."
          on={coords}
          onChange={setCoords}
        />
        <Switch
          label="Ears only"
          hint="Prompts and the engine's moves are spoken and not written, so you have to hear them. Uses your device's built-in voice."
          on={ears}
          onChange={setEars}
        />
        <Switch
          label="Recall checks in games"
          hint="Every few moves a game pauses to ask where one of your hidden pieces is. Miss two in a row and the fog steps back a level for that game."
          on={recall}
          onChange={setRecall}
        />
        <Switch
          label="Voice moves"
          hint="Say your moves out loud in games. Needs Chrome and an internet connection: speech is recognised by Google's servers."
          on={voice}
          onChange={setVoice}
        />
      </section>

      <section>
        <p className="eyebrow">Your progress</p>
        <p className="muted settings__note">
          Progress is saved in this browser only. Back it up to move it to another device or keep it safe if you clear your
          browser data.
        </p>
        <div className="settings__row">
          <button type="button" className="btn" disabled={!progress} onClick={() => progress && downloadBackup(progress)}>
            Back up
          </button>
          <label className="btn settings__restore">
            Restore
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file || !window.confirm('Replace your progress with this backup?')) return;
                window.alert(importProgress(await file.text()) ?? 'Progress restored.');
              }}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn btn--block settings__reset"
          onClick={() => {
            if (window.confirm('Reset all progress? This clears every level and square stat. Settings stay.')) void resetProgress();
          }}
        >
          Reset progress
        </button>
        {currentProfile() && <p className="mono muted settings__note">Profile: {currentProfile()} (separate from your real progress)</p>}
      </section>

      <section>
        <p className="eyebrow">More</p>
        <a className="settings__link" href="#/voice-lab">
          Voice lab: check how well your spoken moves are recognised
        </a>
        <a className="settings__link" href="#/gallery">
          Board gallery
        </a>
      </section>
    </div>
  );
}

function downloadBackup(p: Progress) {
  const blob = new Blob([exportProgress(p)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mindboard-backup-${dayKey(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
