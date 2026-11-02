import { ENGINE_FLOOR, LOW_SETTINGS, UCI_ELO_MIN } from '../engine/engine';
import { STAGE_NAMES } from '../levels/all';
import { MISCLICK_GRACE_MS } from '../game/screenState';
import { FREE_TAKE_BACKS } from '../game/fogGame';
import { BackLink } from './game/parts';
import './Settings.css';

/** How the method works, and every word the app uses, in plain language. */
export function Help() {
  return (
    <div className="app help">
      <header className="game__top">
        <BackLink />
        <span className="game__title">HOW IT WORKS</span>
        <span className="follow__spacer" />
      </header>

      <h1>Seeing the board without the board</h1>
      <p className="muted">
        Blindfold chess is mostly memory and geometry: knowing what every square is called and what colour it is, and keeping a
        picture of the position as moves are made. Mindboard builds that a step at a time.
      </p>

      <h2>The four stages</h2>
      <dl>
        <dt>1 · {STAGE_NAMES[1]}</dt>
        <dd>Name squares and find them, from both sides of the board, then without the letters and numbers.</dd>
        <dt>2 · {STAGE_NAMES[2]}</dt>
        <dd>
          Read and write moves in notation (Nf3, exd5, O-O) until you can picture them. The{' '}
          <a href="#/notation" className="settings__help">notation cheat sheet</a> has every rule on four cards.
        </dd>
        <dt>3 · {STAGE_NAMES[3]}</dt>
        <dd>Real games against the engine where more and more of your pieces disappear.</dd>
        <dt>4 · {STAGE_NAMES[4]}</dt>
        <dd>A dark board, a move list only, and finally no board at all.</dd>
      </dl>
      <p className="muted">
        Already know the board? The placement test on the home screen can skip Stages 1 and 2 in a few minutes.
      </p>

      <h2>Words you'll see</h2>
      <dl>
        <dt>Slip</dt>
        <dd>
          A move that shows you lost the picture: moving a piece that isn't where you thought, or a move that isn't legal. A
          game level allows up to 3 slips per game.
        </dd>
        <dt>Lost track</dt>
        <dd>
          A slip where we can tell what happened, e.g. "your knight left g1 on move 3; it's on f3". These are counted per
          square, separately from how well you name squares.
        </dd>
        <dt>Misclick</dt>
        <dd>
          A wrong square on the board can be waved off with "Misclick? Don't count it" for {MISCLICK_GRACE_MS / 1000} seconds.
          Typed moves can't, because typing is deliberate.
        </dd>
        <dt>Take back</dt>
        <dd>
          Undo your last move. The first {FREE_TAKE_BACKS === 1 ? 'one' : FREE_TAKE_BACKS} in a game is free; after that each
          counts as a slip.
        </dd>
        <dt>Peek</dt>
        <dd>
          Hold the eye button (or Space) to see the whole board for a moment. Harder levels give you only a few seconds of
          peeking per game.
        </dd>
        <dt>Fog</dt>
        <dd>Some of your pieces are invisible. They're still there and still move; you just can't see them.</dd>
        <dt>Passing a level</dt>
        <dd>
          Drills: get enough right (and sometimes fast enough). Games: two of your last three games must count. A game counts
          if you don't lose and stay within the slip limit.
        </dd>
        <dt>Move on anyway</dt>
        <dd>
          Just missed a drill level (15 out of 20 on a 90% level)? You can go on to the next one. The level you left gets an
          amber come-back mark, and a few of its questions join Today's warm-up until you pass it. You finish the ladder
          once every come-back level is passed.
        </dd>
        <dt>Engine rating (≈900 and so on)</dt>
        <dd>
          How strong the computer plays, measured by playing it against Stockfish's own rating-limited mode, so it's a fair
          comparison between levels and a rough guide to human ratings. The weakest setting plays at about {ENGINE_FLOOR};
          the steps are {LOW_SETTINGS.map((s) => s.measured).join(', ')} and then {UCI_ELO_MIN} upwards. Win and it creeps up
          for that level; lose and it eases off.
        </dd>
        <dt>Review squares</dt>
        <dd>
          Squares you miss come back in drills on later days (after 1, 3, 7, 16 and 30 days) until you've got them for good.
        </dd>
        <dt>Ears only</dt>
        <dd>
          In Settings. Prompts and engine moves are spoken instead of written, the way a real blindfold game feels. Uses
          your device's built-in voice, which works offline.
        </dd>
        <dt>Voice moves</dt>
        <dd>
          Say your moves instead of typing. This needs Chrome and an internet connection: the browser sends your audio to
          Google to recognise it. Use headphones so the app doesn't hear itself.
        </dd>
      </dl>
    </div>
  );
}
