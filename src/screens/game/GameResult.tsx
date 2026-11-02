// The panel shown when a game or study position ends.

import type { StudyPosition } from '../../chess/positions';
import { type GameState, gamePasses } from '../../game/fogGame';
import { ALL_LEVELS, STAGE_NAMES, levelHref } from '../../levels/all';
import type { GameLevel } from '../../levels/games';
import { type LevelRecord, recentPasses } from '../../progress/progress';
import { GameReview } from '../GameReview';
import { STUDY_MAX_SLIPS } from './useFogGame';

interface Props {
  game: GameState;
  level: GameLevel;
  scenario?: StudyPosition;
  record?: LevelRecord;
  studyPassed: boolean | null;
  evals: { start: number | null; end: number | null };
  onRestart: () => void;
  onDone?: () => void;
}

export function GameResult({ game, level, scenario, record, studyPassed, evals, onRestart, onDone }: Props) {
  const result = game.result!;
  const idx = ALL_LEVELS.findIndex((l) => l.id === level.id);
  const next = scenario ? undefined : ALL_LEVELS[idx + 1];
  return (
    <section className="result">
      <p className="eyebrow">{scenario ? 'Study and continue' : STAGE_NAMES[level.stage]}</p>
      {scenario ? (
        <StudyResult game={game} passed={studyPassed} evals={evals} />
      ) : (
        <>
          <h1 data-outcome={result.outcome}>{result.outcome === 'win' ? 'You won' : result.outcome === 'draw' ? 'Draw' : 'You lost'}</h1>
          <p className="muted">{result.reason}</p>
        </>
      )}
      <div className="results__stats">
        <div>
          <span className="mono">{game.slips.length}</span>
          <span>slips (max {scenario ? STUDY_MAX_SLIPS : level.pass.maxSlips})</span>
        </div>
        <div>
          <span className="mono">{Math.round(game.peekMsUsed / 1000)}s</span>
          <span>peeking</span>
        </div>
        {!scenario && (
          <div>
            <span className="mono">
              {recentPasses(record, level)}/{level.pass.need}
            </span>
            <span>of your last {level.pass.of} games counted</span>
          </div>
        )}
      </div>
      {!scenario && (
        <p className="muted">
          {gamePasses(game)
            ? 'That one counts.'
            : game.shownAs.id !== level.id
              ? "Dropped back mid-game, so this one doesn't count."
              : result.outcome === 'loss'
                ? "A loss doesn't count."
                : 'Too many slips for this one to count.'}
          {record?.passed ? ' Level passed.' : ''}
        </p>
      )}
      {game.slips.length > 0 && (
        <ul className="result__slips">
          {game.slips.map((s, i) => (
            <li key={i} data-kind={s.kind}>
              <span className="mono">Move {s.moveNumber}</span> {s.text}
            </li>
          ))}
        </ul>
      )}
      <GameReview startFen={game.startFen} moves={game.moves} color={game.color} />
      <div className="results__actions">
        {onDone ? (
          <button type="button" className="btn btn--primary btn--block" onClick={onDone}>
            Continue →
          </button>
        ) : (
          <button type="button" className="btn btn--primary btn--block" onClick={onRestart}>
            {scenario ? 'Try it again' : 'New game'}
          </button>
        )}
        {scenario && !onDone && (
          <a className="btn btn--block" href={`#/study?n=${Date.now()}`}>
            Another position →
          </a>
        )}
        {record?.passed && next && !onDone && (
          <a className="btn btn--block" href={levelHref(next)}>
            Next level: {next.title} →
          </a>
        )}
        {!onDone && (
          <a className="btn btn--block" href="#/">
            Back to journey
          </a>
        )}
      </div>
    </section>
  );
}

function StudyResult({ game, passed, evals }: { game: GameState; passed: boolean | null; evals: { start: number | null; end: number | null } }) {
  const goal = game.goal!;
  return (
    <>
      <h1 data-outcome={passed === null ? undefined : passed ? 'win' : 'loss'}>{passed === null ? 'Checking…' : passed ? 'Nailed it' : 'Not this time'}</h1>
      <p className="muted">
        {game.result!.reason}
        {goal.kind === 'moves' && evals.start !== null && evals.end !== null ? ` · position ${fmt(evals.start)} → ${fmt(evals.end)}` : ''}
      </p>
    </>
  );
}

const fmt = (cp: number) => `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
