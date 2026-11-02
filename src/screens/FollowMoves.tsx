import { useEffect, useRef, useState } from 'react';
import { Board, type Highlight } from '../board/Board';
import type { Square } from '../board/squares';
import { moveToWords } from '../chess/spoken';
import { type FollowRound, checkFollow, makeFollowRound } from '../drills/follow';
import { withFollowRound } from '../progress/progress';
import { useProgress } from '../progress/store';
import { useKeys } from '../ui/keypads';
import { Speaker } from '../voice/recogniser';
import './FollowMoves.css';

const PACES = [3000, 2000, 1300];
const PREF = 'mindboard.follow';

function readPrefs(): { pace: number; aloud: boolean } {
  try {
    return { pace: 1, aloud: false, ...JSON.parse(localStorage.getItem(PREF) ?? '{}') };
  } catch {
    return { pace: 1, aloud: false };
  }
}

type Phase = 'reading' | 'questions' | 'reveal';

export function FollowMoves({ onDone }: { onDone?: () => void }) {
  const { progress, update } = useProgress();
  const [round, setRound] = useState<FollowRound | null>(null);
  const [phase, setPhase] = useState<Phase>('reading');
  const [shown, setShown] = useState(0);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [prefs, setPrefs] = useState(readPrefs);
  const speaker = useRef(new Speaker());

  const savePrefs = (p: { pace: number; aloud: boolean }) => {
    setPrefs(p);
    try {
      localStorage.setItem(PREF, JSON.stringify(p));
    } catch {
      // Not remembered; fine for this visit.
    }
  };

  const fresh = () => {
    if (!progress) return;
    setRound(makeFollowRound(progress.follow.plies, Math.random));
    setPhase('reading');
    setShown(0);
    setQi(0);
    setPicked(null);
    setScore(0);
  };
  useEffect(() => {
    if (progress && !round) fresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress !== null]);

  // Reveal the moves one at a time.
  const advance = () => {
    if (!round || phase !== 'reading') return;
    if (shown >= round.moves.length) setPhase('questions');
    else setShown((n) => n + 1);
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    if (!round || phase !== 'reading') return;
    const m = shown > 0 ? round.moves[shown - 1] : null;
    let cancelled = false;
    const wait = async () => {
      if (m && prefs.aloud) await speaker.current.speak(`${m.color === 'w' ? 'White' : 'Black'}: ${moveToWords(m)}`, 1.1);
      await new Promise((r) => setTimeout(r, shown === 0 ? 600 : PACES[prefs.pace]));
      if (!cancelled) advanceRef.current();
    };
    void wait();
    return () => {
      cancelled = true;
    };
  }, [round, phase, shown, prefs.aloud, prefs.pace]);
  useEffect(() => () => speaker.current.cancel(), []);

  const q = round?.questions[qi];
  const answerQ = (o: string) => {
    if (!q || picked) return;
    setPicked(o);
    const right = checkFollow(q, o);
    const total = score + (right ? 1 : 0);
    if (right) setScore(total);
    if (prefs.aloud) void speaker.current.speak(right ? 'Right.' : q.kind === 'where' ? `No, ${q.answers.join(' or ')}.` : `No, ${q.answer}.`);
    setTimeout(() => {
      setPicked(null);
      if (qi + 1 < round!.questions.length) setQi(qi + 1);
      else {
        setPhase('reveal');
        update((p) => withFollowRound(p, total, round!.questions.length, new Date()));
      }
    }, right ? 600 : 1500);
  };

  useKeys(phase === 'reading', (e) => {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      speaker.current.cancel();
      advance();
    }
  });
  useKeys(phase === 'questions' && !picked, (e) => {
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (i >= 0 && q) answerQ(q.options[i]!);
  });

  if (!round || !progress) return <div className="app" />;
  const m = shown > 0 ? round.moves[shown - 1]! : null;
  const total = round.questions.length;

  return (
    <div className="app follow">
      <header className="game__top">
        <a href="#/" className="icon-btn" aria-label="Back to journey">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </a>
        <span className="game__title">FOLLOW THE MOVES · {round.moves.length} MOVES</span>
        <span className="follow__spacer" />
      </header>

      {phase === 'reading' && (
        <>
          <p className="muted follow__hint">No board. Picture each move as it comes.</p>
          <div className="follow__stage" onClick={advance}>
            {m ? (
              <>
                <span className="follow__count mono">
                  {shown} / {round.moves.length}
                </span>
                <span className="follow__san mono" key={shown}>
                  {m.color === 'w' ? `${moveNo(m)}.` : `${moveNo(m)}…`}
                  {m.san}
                </span>
              </>
            ) : (
              <span className="follow__ready">Get ready…</span>
            )}
          </div>
          <div className="follow__controls">
            <div className="seg" role="group" aria-label="Speed">
              {['Slow', 'Medium', 'Fast'].map((label, i) => (
                <button key={label} type="button" data-on={prefs.pace === i || undefined} onClick={() => savePrefs({ ...prefs, pace: i })}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="chip follow__aloud" aria-pressed={prefs.aloud} onClick={() => savePrefs({ ...prefs, aloud: !prefs.aloud })}>
              {prefs.aloud ? 'Reading aloud' : 'Read aloud'}
            </button>
          </div>
          <p className="muted follow__keys">Space or click for the next move.</p>
        </>
      )}

      {phase === 'questions' && q && (
        <section className="follow__q">
          <p className="eyebrow">
            Question {qi + 1} of {total}
          </p>
          <h1>{q.prompt}</h1>
          <div className="follow__opts" data-kind={q.kind}>
            {q.options.map((o, i) => (
              <button
                key={o}
                type="button"
                className="follow__opt"
                disabled={!!picked}
                data-state={picked ? (checkFollow(q, o) ? 'right' : o === picked ? 'wrong' : undefined) : undefined}
                onClick={() => answerQ(o)}
              >
                <span className="follow__key mono">{i + 1}</span>
                <span className={q.kind === 'where' ? 'mono' : ''}>{o}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {phase === 'reveal' && (
        <section className="follow__reveal">
          <p className="eyebrow">{round.opening}</p>
          <h1 className={score === total ? 'results__win' : ''}>
            {score}/{total}
          </h1>
          <p className="muted">
            {score === total ? 'Perfect. ' : ''}Next round reads {progress.follow.plies} moves.
          </p>
          <div className="follow__board">
            <Board fen={round.fen} highlights={revealHighlights(round)} label="Final position" />
          </div>
          <p className="mono follow__line">
            {round.moves.map((mv, i) => (mv.color === 'w' ? `${moveNo(mv)}.${mv.san} ` : `${i === 0 ? `${moveNo(mv)}…` : ''}${mv.san} `))}
          </p>
          <div className="results__actions">
            {onDone ? (
              <button type="button" className="btn btn--primary btn--block" onClick={onDone}>
                Continue →
              </button>
            ) : (
              <button type="button" className="btn btn--primary btn--block" onClick={fresh}>
                Next round
              </button>
            )}
            {!onDone && (
              <a className="btn btn--block" href="#/">
                Back to journey
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** Full-move number of a chess.js move, read from the position before it. */
const moveNo = (m: { before: string }) => Number(m.before.split(' ')[5]);

function revealHighlights(r: FollowRound): Partial<Record<Square, Highlight>> {
  const hl: Partial<Record<Square, Highlight>> = {};
  for (const q of r.questions) {
    if (q.kind === 'where') for (const a of q.answers) hl[a] = 'target';
    else hl[q.square] = 'from';
  }
  return hl;
}
