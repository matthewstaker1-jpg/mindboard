import { useEffect, useRef, useState } from 'react';
import type { Move } from 'chess.js';
import type { Square } from '../board/squares';
import { PIECE_NAME } from '../chess/game';
import { moveToWords, readBack, squareWords } from '../chess/spoken';
import { type GameState, type PlayerMoveResult, replay } from '../game/fogGame';
import { parseCommand } from '../voice/commands';
import { type Alternative, matchSpokenMove } from '../voice/moveMatcher';
import { Speaker, WebSpeechRecogniser } from '../voice/recogniser';
import './VoicePanel.css';

/** How long you have to say "no" after a move is read back. */
const CANCEL_MS = 1500;
/** Board questions cost peek time, so they can't replace remembering. */
const QUERY_COST_MS = { where: 3000, whatsOn: 3000, list: 6000 };

const PREF = 'mindboard.voice';
function voicePref(): boolean {
  try {
    return localStorage.getItem(PREF) === 'on';
  } catch {
    return false;
  }
}
function setVoicePref(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? 'on' : 'off');
  } catch {
    // Not remembered this time; the switch still works.
  }
}

export interface VoicePanelProps {
  game: GameState;
  fen: string;
  yourTurn: boolean;
  /** Play a move (UCI or SAN); returns what happened so it can be spoken. */
  onMove: (text: string) => PlayerMoveResult;
  onTakeBack: () => void;
  onResign: () => void;
  /** Spend peek time on a board question; false if there's none left. */
  onPeekSpend: (ms: number) => boolean;
}

const nameOf = (c: 'w' | 'b') => (c === 'w' ? 'White' : 'Black');

/** Hands-free play: say moves, hear them read back and hear the engine's replies. */
export function VoicePanel({ game, fen, yourTurn, onMove, onTakeBack, onResign, onPeekSpend }: VoicePanelProps) {
  const [on, setOn] = useState(voicePref);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<Move | null>(null);
  const [choices, setChoices] = useState<Move[] | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const rec = useRef(new WebSpeechRecogniser());
  const speaker = useRef(new Speaker());
  const speaking = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supported = rec.current.supported;

  // The latest props, for handlers registered once.
  const live = useRef({ game, fen, yourTurn, onMove, onTakeBack, onResign, onPeekSpend, pending, choices, confirmResign });
  live.current = { game, fen, yourTurn, onMove, onTakeBack, onResign, onPeekSpend, pending, choices, confirmResign };

  const say = async (text: string) => {
    setStatus(text);
    speaking.current = true;
    await speaker.current.speak(text);
    speaking.current = false;
  };

  const lastMoveVerbose = (g: GameState): Move | undefined => replay(g.startFen, g.moves).history({ verbose: true }).at(-1);

  const clearPending = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending(null);
  };

  const commit = (m: Move) => {
    clearPending();
    const r = live.current.onMove(m.lan);
    if (r.kind === 'slip') void say(r.message);
    else if (r.kind === 'unreadable') void say(r.message);
  };

  const propose = async (m: Move) => {
    setChoices(null);
    setPending(m);
    await say(`${readBack(m)}.`);
    timer.current = setTimeout(() => commit(m), CANCEL_MS);
  };

  const answerQuery = async (cost: number, answer: () => string) => {
    if (!live.current.onPeekSpend(cost)) {
      await say('No looks left this game.');
      return;
    }
    await say(answer());
  };

  const describePieces = (types: string[]) => {
    const { game: g } = live.current;
    const c = replay(g.startFen, g.moves);
    const parts: string[] = [];
    for (const t of types) {
      const sqs: Square[] = [];
      for (const row of c.board()) for (const cell of row) if (cell && cell.color === g.color && cell.type === t) sqs.push(cell.square as Square);
      const name = PIECE_NAME[t]!;
      if (sqs.length === 0) parts.push(types.length === 1 ? `You have no ${name}.` : '');
      else parts.push(`${sqs.length > 1 ? `${name}s` : name} on ${sqs.map(squareWords).join(' and ')}`);
    }
    return parts.filter(Boolean).join('. ') + '.';
  };

  const onPhrase = async (alts: Alternative[]) => {
    if (speaking.current) return;
    const L = live.current;
    setHeard(alts.map((a) => a.transcript.trim()).filter(Boolean).slice(0, 3).join('  ·  '));
    const cmd = alts.map((a) => parseCommand(a.transcript)).find((c) => c) ?? null;

    if (L.pending) {
      if (cmd?.kind === 'cancel') {
        clearPending();
        await say('Cancelled. Your move.');
        return;
      }
      if (cmd?.kind === 'yes') {
        commit(L.pending);
        return;
      }
      clearPending();
    }
    if (L.confirmResign) {
      setConfirmResign(false);
      if (cmd?.kind === 'yes') {
        L.onResign();
        await say('You resigned.');
      } else await say('Carry on.');
      return;
    }

    if (cmd) {
      switch (cmd.kind) {
        case 'repeat': {
          const m = lastMoveVerbose(L.game);
          await say(m ? `${nameOf(m.color)} played ${moveToWords(m)}.` : 'No moves yet.');
          return;
        }
        case 'where':
          await answerQuery(QUERY_COST_MS.where, () => describePieces([cmd.piece]));
          return;
        case 'list':
          await answerQuery(QUERY_COST_MS.list, () => describePieces(['k', 'q', 'r', 'b', 'n', 'p']));
          return;
        case 'whatsOn':
          await answerQuery(QUERY_COST_MS.whatsOn, () => {
            const p = replay(L.game.startFen, L.game.moves).get(cmd.square);
            return `${squareWords(cmd.square)}: ${p ? `${p.color === 'w' ? 'white' : 'black'} ${PIECE_NAME[p.type]}` : 'empty'}.`;
          });
          return;
        case 'takeBack':
          L.onTakeBack();
          await say('Taken back. Your move.');
          return;
        case 'resign':
          setConfirmResign(true);
          await say('Resign? Say yes to confirm.');
          return;
        case 'choice':
          if (L.choices?.length) {
            const m = cmd.index < 0 ? L.choices.at(-1)! : L.choices[cmd.index];
            if (m) await propose(m);
            return;
          }
          break;
        case 'cancel':
        case 'yes':
          return;
      }
    }

    if (!L.yourTurn) {
      await say("It's not your move yet.");
      return;
    }
    const r = matchSpokenMove(alts, L.fen, L.choices ?? undefined);
    if (r.kind === 'confident') await propose(r.move);
    else if (r.kind === 'ask') {
      setChoices(r.options);
      await say(`Did you mean ${r.options.map((m) => moveToWords(m)).join(', or ')}?`);
    } else {
      setChoices(null);
      await say("Sorry, I didn't catch that.");
    }
  };
  const phraseRef = useRef(onPhrase);
  phraseRef.current = onPhrase;

  useEffect(() => {
    const r = rec.current;
    const s = speaker.current;
    r.onPhrase = (alts) => void phraseRef.current(alts);
    r.onState = setListening;
    r.onError = (m) => setStatus(m);
    return () => {
      r.stop();
      s.cancel();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (on && supported) rec.current.start();
    else rec.current.stop();
  }, [on, supported]);

  // Read the engine's moves (and the result) aloud.
  const spokenPly = useRef(game.moves.length);
  useEffect(() => {
    if (!on || game.moves.length <= spokenPly.current) {
      spokenPly.current = game.moves.length;
      return;
    }
    spokenPly.current = game.moves.length;
    const m = lastMoveVerbose(game);
    if (m && m.color !== game.color) void say(`${nameOf(m.color)} plays ${moveToWords(m)}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.moves.length, on]);
  useEffect(() => {
    if (on && game.result) void say(game.result.outcome === 'win' ? `${game.result.reason}. You won.` : game.result.outcome === 'loss' ? `${game.result.reason}. You lost.` : `${game.result.reason}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.result]);

  if (game.result) return null;

  return (
    <section className="voice" data-on={on || undefined}>
      <button
        type="button"
        className="voice__mic"
        aria-pressed={on}
        disabled={!supported}
        onClick={() => {
          const v = !on;
          setOn(v);
          setVoicePref(v);
          if (v) void say(yourTurn ? 'Voice on. Your move.' : 'Voice on.');
          else speaker.current.cancel();
        }}
        title={supported ? 'Say your moves' : 'Voice needs Chrome'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        <span>{!supported ? 'Voice needs Chrome' : on ? (listening ? 'Listening' : 'Starting…') : 'Voice off'}</span>
      </button>
      {on && (
        <div className="voice__status">
          {heard && (
            <span className="voice__heard">
              Heard: <span className="mono">{heard}</span>
            </span>
          )}
          {pending ? (
            <span>
              Playing <span className="mono">{pending.san}</span>… say “no” to cancel
            </span>
          ) : (
            status && <span>{status}</span>
          )}
          {choices && (
            <span className="voice__choices">
              {choices.map((m) => (
                <button key={m.lan} type="button" className="btn" onClick={() => void propose(m)}>
                  <span className="mono">{m.san}</span>
                </button>
              ))}
            </span>
          )}
          <span className="voice__help">Say a move, or: repeat · where is my knight · what's on e5 · take back · resign</span>
        </div>
      )}
    </section>
  );
}
