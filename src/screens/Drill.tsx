import { useEffect, useRef, useState } from 'react';
import { Board, type BoardProps, type Highlight } from '../board/Board';
import { EMPTY_FEN, isSquare, isWhitePiece, mirrorSquare, parsePlacement, placementFen, type Square } from '../board/squares';
import { PIECE_NAME, numberedSan } from '../chess/game';
import { normaliseSanAnswer } from '../chess/notation';
import { type Question, expectedAnswer } from '../drills/questions';
import { type SessionState, isFinished, newSession, nextQuestion, submitAnswer, summarise } from '../drills/session';
import { ALL_LEVELS, levelHref, stagePosition } from '../levels/all';
import { type LevelDef, type SessionSummary, canMoveOn, passes } from '../levels/ladder';
import { dueSquares, withAnswer, withMovedOn, withSession } from '../progress/progress';
import { usePref, useProgress } from '../progress/store';
import { moveToWords, squareWords } from '../chess/spoken';
import { Speaker } from '../voice/recogniser';
import { NotationKeyboard, SquareKeypad, useKeys } from '../ui/keypads';
import { CoordsToggle, useCoordsPref } from '../ui/prefs';
import './Drill.css';

type Phase = 'ask' | 'feedback' | 'done';

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;


/**
 * A drill session. With `onDone` it's one step of Today: practice only, so
 * no level record is written, and the results screen offers Continue.
 */
export function Drill({ level, onDone, onFinish }: { level: LevelDef; onDone?: () => void; onFinish?: (summary: SessionSummary) => void }) {
  const { progress, update } = useProgress();
  const [coordsOn] = useCoordsPref();
  const [session, setSession] = useState<SessionState>(() => newSession(level));
  const [q, setQ] = useState<Question | null>(null);
  const [phase, setPhase] = useState<Phase>('ask');
  const [given, setGiven] = useState('');
  const [typed, setTyped] = useState('');
  const [correct, setCorrect] = useState(false);
  const [ms, setMs] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const startRef = useRef(0);
  const [earsOnly] = usePref('earsOnly');
  const speaker = useRef(new Speaker());
  // Ears only: the prompt is spoken; the clock starts once you've heard it.
  const say = async (question: Question) => {
    const text = spokenPrompt(question);
    if (!text) return;
    speaker.current.cancel();
    await speaker.current.speak(text);
    startRef.current = performance.now();
  };
  useEffect(() => {
    if (earsOnly && q && phase === 'ask') void say(q);
    // Speak each new question once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id, earsOnly]);
  useEffect(() => () => speaker.current.cancel(), []);

  const ask = (s: SessionState) => {
    if (!progress) return;
    const n = nextQuestion(s, progress.stats, Math.random, dueSquares(progress, new Date()));
    setSession(n.session);
    setQ(n.question);
    setPhase('ask');
    setGiven('');
    setTyped('');
    startRef.current = performance.now();
  };

  useEffect(() => {
    if (progress && !q && phase === 'ask') ask(session);
    // Only once progress has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress !== null]);

  const answer = (g: string) => {
    if (!q || phase !== 'ask') return;
    const took = performance.now() - startRef.current;
    const r = submitAnswer(session, q, g, took, Math.random);
    setSession(r.session);
    setGiven(g);
    setCorrect(r.correct);
    setMs(took);
    update((p) => withAnswer(p, q.orientation, q.statSquare, r.correct, took, r.session.run));
    setPhase('feedback');
  };

  const next = () => {
    if (isFinished(session)) {
      const sum = summarise(session);
      if (!onDone) update((p) => withSession(p, level, sum, new Date()));
      onFinish?.(sum);
      setSummary(sum);
      setPhase('done');
      return;
    }
    ask(session);
  };
  const nextRef = useRef(next);
  nextRef.current = next;

  // Right answers move on by themselves; wrong ones wait so you can read why.
  useEffect(() => {
    if (phase !== 'feedback' || !correct) return;
    const t = setTimeout(() => nextRef.current(), level.pass.maxMedianMs ? 450 : 750);
    return () => clearTimeout(t);
  }, [phase, correct, q?.id, level.pass.maxMedianMs]);

  const canContinue = phase === 'feedback' && !correct;
  useKeys(canContinue, (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      next();
    }
  });

  if (import.meta.env.DEV) {
    (window as unknown as { __mindboard: unknown }).__mindboard = { question: q, phase, expected: q && expectedAnswer(q) };
  }

  const pos = stagePosition(level.id);

  if (phase === 'done' && summary) {
    return <Results level={level} summary={summary} bestRun={Math.max(...runs(session))} onDone={onDone} onMoveOn={() => update((p) => withMovedOn(p, level.id))} onRetry={() => {
      const s = newSession(level);
      setSummary(null);
      setSession(s);
      ask(s);
    }} />;
  }

  return (
    <div className="app drill">
      <header className="drill__top">
        <a href="#/" className="icon-btn" aria-label="Back to journey">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </a>
        <div className="drill__progress">
          <div className="drill__meta">
            <span>
              {pos ? `LEVEL ${pos.index} OF ${pos.count}` : level.title.toUpperCase()}
            </span>
            <span>
              {Math.min(session.answers.length + (phase === 'ask' ? 1 : 0), level.questions)} / {level.questions}
            </span>
          </div>
          <div className="bar">
            <div style={{ width: `${(session.answers.length / level.questions) * 100}%` }} />
          </div>
        </div>
        {q?.orientation === 'black' && (
          <span className="chip drill__side">
            <span className="drill__side-dot" />
            BLACK
          </span>
        )}
        <CoordsToggle allowed={q?.labels ?? level.labels} />
        <span className="drill__run" title="Correct in a row">
          <Flame />×{session.run}
        </span>
      </header>

      {q && (earsOnly && spokenPrompt(q) ? <EarsPrompt q={q} onReplay={() => void say(q)} /> : <Prompt q={q} coordsOn={coordsOn} />)}

      {q && (
        <div className="drill__board">
          <Board
            {...boardFor(q, phase, given, correct)}
            {...(phase === 'ask' ? boardInput(q, answer) : {})}
            showLabels={q.labels && coordsOn}
            label="Drill board"
          />
        </div>
      )}

      {q && phase !== 'ask' && (
        <Feedback q={q} given={given} correct={correct} ms={ms} />
      )}

      {q && phase === 'ask' && <Input q={q} typed={typed} setTyped={setTyped} answer={answer} />}

      {canContinue && (
        <button type="button" className="btn btn--primary btn--block drill__next" onClick={next} autoFocus>
          {isFinished(session) ? 'See results' : 'Next'}
          <span className="drill__kbd">↵</span>
        </button>
      )}
    </div>
  );
}

function runs(s: SessionState): number[] {
  const out = [0];
  let r = 0;
  for (const a of s.answers) {
    r = a.correct ? r + 1 : 0;
    out.push(r);
  }
  return out;
}

function Flame() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22c4 0 7-2.7 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4.3 3 7 7 7z" />
    </svg>
  );
}

function viewNote(q: Question, coordsOn: boolean): string {
  const side = q.orientation === 'white' ? "White's view" : "Black's view";
  const labels = q.labels && coordsOn ? 'coordinates on' : 'labels off';
  return `${side} · ${labels} · ${secs(q.targetMs)} target`;
}

/** What Ears only says for questions you answer on the board; null for ones that need you to see the board. */
export function spokenPrompt(q: Question): string | null {
  switch (q.kind) {
    case 'tapSquare':
      return squareWords(q.square);
    case 'readMove':
      return `${q.move.color === 'w' ? 'White' : 'Black'}: ${moveToWords(q.move)}`;
    case 'knightPath':
      return `Knight from ${squareWords(q.from)} to ${squareWords(q.to)}, in two hops`;
    default:
      return null;
  }
}

function EarsPrompt({ q, onReplay }: { q: Question; onReplay: () => void }) {
  const what = q.kind === 'tapSquare' ? 'Tap the square you hear' : q.kind === 'readMove' ? 'Play the move you hear' : 'Move the knight to a square in between';
  return (
    <div className="prompt prompt--split">
      <div>
        <p className="prompt__kicker">Ears only</p>
        <h1>{what}</h1>
      </div>
      <button type="button" className="chip prompt__replay" onClick={onReplay}>
        Hear it again
      </button>
    </div>
  );
}

function Prompt({ q, coordsOn }: { q: Question; coordsOn: boolean }) {
  switch (q.kind) {
    case 'nameSquare':
      return (
        <div className="prompt">
          <h1>What square is this?</h1>
          <p>{viewNote(q, coordsOn)}</p>
        </div>
      );
    case 'tapSquare':
      return (
        <div className="prompt">
          <h1>
            Tap <span className="mono">{q.square}</span>
          </h1>
          <p>{viewNote(q, coordsOn)}</p>
        </div>
      );
    case 'writeMove': {
      const m = q.move;
      const what = m.isCastle ? 'The king castles' : `The ${PIECE_NAME[m.piece]} goes`;
      return (
        <div className="prompt">
          <h1>Write the move</h1>
          <p>
            {what} from the green square to the lime one{m.isPromotion ? ' and promotes' : ''}.{' '}
            <span className="prompt__tag">{m.opening}</span>
          </p>
        </div>
      );
    }
    case 'readMove':
      return (
        <div className="prompt prompt--split">
          <div>
            <p className="prompt__kicker">You play</p>
            <div className="prompt__big mono">{numberedSan(q.move)}</div>
          </div>
          <p className="prompt__aside">Move the piece</p>
        </div>
      );
    case 'knightPath':
      return (
        <div className="prompt prompt--split">
          <div>
            <p className="prompt__kicker">Knight route · two hops</p>
            <div className="prompt__big mono">
              {q.from} → {q.to}
            </div>
          </div>
          <p className="prompt__aside">Move the knight to a square in between, or type it</p>
        </div>
      );
  }
}

function boardFor(q: Question, phase: Phase, given: string, correct: boolean): BoardProps {
  const asking = phase === 'ask';
  const g = given.toLowerCase();
  // Moves come in as "f8b4"; the square that matters for marking is where it landed.
  const landed = q.kind === 'readMove' || q.kind === 'knightPath' ? g.slice(-2) : g;
  const wrongSq = !asking && !correct && isSquare(landed) ? landed : null;
  const hl: Partial<Record<Square, Highlight>> = {};
  const marks: Partial<Record<Square, string>> = {};
  const base = { orientation: q.orientation, showLabels: q.labels, highlights: hl, marks };

  switch (q.kind) {
    case 'nameSquare':
    case 'tapSquare': {
      if (q.kind === 'nameSquare' || !asking) {
        hl[q.square] = 'target';
        marks[q.square] = asking ? '?' : q.square;
      }
      if (wrongSq && wrongSq !== q.square) {
        hl[wrongSq] = 'warn';
        marks[wrongSq] = '×';
      }
      return { ...base, fen: EMPTY_FEN };
    }
    case 'writeMove':
      hl[q.move.from] = 'from';
      hl[q.move.to] = 'target';
      return { ...base, fen: q.move.fenBefore };
    case 'readMove': {
      if (asking) return { ...base, fen: q.move.fenBefore };
      hl[q.move.from] = 'from';
      hl[q.move.to] = 'target';
      if (wrongSq && wrongSq !== q.move.to) {
        hl[wrongSq] = 'warn';
        marks[wrongSq] = '×';
      }
      return { ...base, fen: q.move.fenAfter };
    }
    case 'knightPath': {
      hl[q.from] = 'from';
      hl[q.to] = 'target';
      if (!asking) {
        for (const m of q.mids) marks[m] = '•';
        if (correct && isSquare(landed)) marks[landed] = '✓';
        if (wrongSq && !q.mids.includes(wrongSq)) {
          hl[wrongSq] = 'warn';
          marks[wrongSq] = '×';
        }
      }
      return { ...base, fen: placementFen({ [q.from]: q.orientation === 'white' ? 'N' : 'n' }) };
    }
  }
}

/** How the board itself takes an answer while a question is open. */
function boardInput(q: Question, answer: (g: string) => void): Partial<BoardProps> {
  switch (q.kind) {
    case 'tapSquare':
      return { onTap: answer };
    case 'readMove': {
      // Any of your own pieces can be picked up, so picking the wrong one is a real mistake.
      const mine = q.move.color === 'w';
      return { onMove: (f, t) => answer(f + t), canDrag: (_s, p) => isWhitePiece(p) === mine };
    }
    case 'knightPath':
      return { onMove: (f, t) => answer(f + t), canDrag: (s) => s === q.from };
    default:
      return {};
  }
}

function Input({
  q,
  typed,
  setTyped,
  answer,
}: {
  q: Question;
  typed: string;
  setTyped: (s: string) => void;
  answer: (g: string) => void;
}) {
  switch (q.kind) {
    case 'nameSquare':
      return (
        <div className="drill__input">
          <SquareKeypad onSquare={answer} />
          <p className="drill__hint">Click the keys or type it, e.g. f6</p>
        </div>
      );
    case 'writeMove':
      return (
        <div className="drill__input">
          <NotationKeyboard value={typed} onChange={setTyped} onSubmit={answer} />
        </div>
      );
    case 'knightPath':
      return (
        <div className="drill__input">
          <SquareKeypad onSquare={answer} />
        </div>
      );
    case 'tapSquare':
    case 'readMove':
      return null;
  }
}

function Feedback({ q, given, correct, ms }: { q: Question; given: string; correct: boolean; ms: number }) {
  const want = expectedAnswer(q);
  if (correct) {
    return (
      <div className="feedback feedback--right" role="status">
        <Check />
        <span>
          <span className="mono">{q.kind === 'writeMove' || q.kind === 'readMove' ? q.move.san : given.length === 4 ? given.slice(2) : given}</span> — correct · {secs(ms)}
        </span>
      </div>
    );
  }
  let why: string | null = null;
  const g = given.toLowerCase();
  if ((q.kind === 'nameSquare' || q.kind === 'tapSquare') && isSquare(g) && mirrorSquare(g) === q.square) {
    why =
      q.orientation === 'black'
        ? `That's ${q.square} seen from White's side. From Black's chair the files run h → a, left to right, and rank 1 is at the top.`
        : `That's where ${q.square} sits from Black's side. From White's chair a1 is bottom-left.`;
  }
  if (q.kind === 'writeMove') {
    const a = normaliseSanAnswer(given);
    const b = normaliseSanAnswer(q.move.san);
    if (a === b.replace('x', '')) why = 'Captures need an x.';
    else if (b.includes('=') && !a.includes('=')) why = 'Promotions name the new piece, like e8=Q.';
    else if (/^[KQRBN][a-h1-8]x?[a-h][1-8]/.test(b) && a.length < b.length)
      why = 'Two of your pieces could go there, so add the file or rank it starts from.';
    else if (q.move.piece !== 'p' && !q.move.isCastle && a[0] !== b[0]) why = `Start with the piece letter: ${b[0]} for ${PIECE_NAME[q.move.piece]}.`;
  }
  if (q.kind === 'knightPath') why = 'A knight jumps two squares one way and one square the other.';

  if (q.kind === 'readMove') {
    const m = q.move;
    const [gf, gt] = [g.slice(0, 2), g.slice(2, 4)];
    if (gf === m.from) why = `Right piece, wrong square: ${numberedSan(m)} lands on ${m.to}.`;
    else if (gt === m.to) why = `Right square, wrong piece: it's the ${PIECE_NAME[m.piece]} on ${m.from} that goes there.`;
  }

  const verb = q.kind === 'tapSquare' ? 'You tapped' : q.kind === 'writeMove' ? 'You wrote' : q.kind === 'readMove' || given.length === 4 ? 'You moved' : 'You said';
  const shownGiven = q.kind === 'readMove' ? moveText(q.move.fenBefore, g) : given.length === 4 ? `${g.slice(0, 2)}→${g.slice(2)}` : given;
  const shownWant = q.kind === 'readMove' ? moveText(q.move.fenBefore, q.move.from + q.move.to) : want;
  return (
    <div className="feedback feedback--wrong" role="status">
      <div className="feedback__line">
        <Cross />
        <span>
          {verb} <span className="mono">{shownGiven || '—'}</span>. It's <span className="mono feedback__want">{shownWant}</span>
        </span>
      </div>
      {why && <p className="feedback__why">{why}</p>}
      <p className="feedback__requeue">It'll come back in a few questions.</p>
    </div>
  );
}

/** "Bf8→b4" from a position and a from+to string. */
function moveText(fen: string, fromTo: string): string {
  const from = fromTo.slice(0, 2) as Square;
  const p = isSquare(from) ? parsePlacement(fen).get(from) : undefined;
  const letter = p && p.toLowerCase() !== 'p' ? p.toUpperCase() : '';
  return `${letter}${from}→${fromTo.slice(2, 4)}`;
}

function Check() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function Results({
  level,
  summary,
  bestRun,
  onRetry,
  onDone,
  onMoveOn,
}: {
  level: LevelDef;
  summary: SessionSummary;
  bestRun: number;
  onRetry: () => void;
  onDone?: () => void;
  onMoveOn: () => void;
}) {
  if (onDone) {
    return (
      <div className="app results">
        <p className="eyebrow">Today · {level.title}</p>
        <h1 className="results__win">
          {summary.correct}/{summary.total}
        </h1>
        <p className="muted">Median {summary.medianMs != null ? secs(summary.medianMs) : '—'} per square.</p>
        <div className="results__actions">
          <button type="button" className="btn btn--primary btn--block" onClick={onDone} autoFocus>
            Continue →
          </button>
        </div>
      </div>
    );
  }
  const passed = passes(level, summary);
  const idx = ALL_LEVELS.findIndex((l) => l.id === level.id);
  const nextLevel = ALL_LEVELS[idx + 1];
  const pct = Math.round((summary.correct / summary.total) * 100);
  const need = Math.round(level.pass.minAccuracy * 100);
  const moveOn = !passed && nextLevel != null && canMoveOn(level, summary);
  return (
    <div className="app results">
      <p className="eyebrow">
        Stage {level.stage} · {level.title}
      </p>
      <h1 className={passed ? 'results__win' : ''}>{passed ? 'Level passed' : 'Not yet'}</h1>
      <p className="muted">
        {passed
          ? nextLevel
            ? `Next up: ${nextLevel.title}.`
            : 'That was the last level.'
          : `You need ${need}%${level.pass.maxMedianMs ? ` and a median under ${secs(level.pass.maxMedianMs)}` : ''} to pass.`}
      </p>
      {moveOn && (
        <p className="muted results__moveon">
          Close enough to go on. This level gets a come-back mark, and a few of its questions turn up in Today's warm-up
          until you pass it.
        </p>
      )}
      <div className="results__stats">
        <div>
          <span className="mono">
            {summary.correct}/{summary.total}
          </span>
          <span>correct · {pct}%</span>
        </div>
        <div>
          <span className="mono">{summary.medianMs != null ? secs(summary.medianMs) : '—'}</span>
          <span>median time</span>
        </div>
        <div>
          <span className="mono">{bestRun}</span>
          <span>best run</span>
        </div>
      </div>
      <div className="results__actions">
        {passed && nextLevel ? (
          <a className="btn btn--primary btn--block" href={levelHref(nextLevel)}>
            Next level →
          </a>
        ) : moveOn ? (
          <>
            <a className="btn btn--primary btn--block" href={levelHref(nextLevel!)} onClick={onMoveOn}>
              Move on anyway →
            </a>
            <button type="button" className="btn btn--block" onClick={onRetry}>
              Try again
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--primary btn--block" onClick={onRetry}>
            Try again
          </button>
        )}
        {passed && nextLevel && (
          <button type="button" className="btn btn--block" onClick={onRetry}>
            Play this level again
          </button>
        )}
        <a className="btn btn--block" href="#/">
          Back to journey
        </a>
      </div>
    </div>
  );
}
