import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { moveToWords, squareWords } from '../chess/spoken';
import { parseCommand } from './commands';
import { matchSpokenMove, normaliseSpoken } from './moveMatcher';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SCANDI = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const CASTLES = 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 6 8';
// Knights on b1 and f3 can both reach d2.
const TWO_KNIGHTS = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4';

const alt = (...ts: string[]) => ts.map((t, i) => ({ transcript: t, confidence: 0.9 - i * 0.1 }));
const heard = (fen: string, ...ts: string[]) => {
  const r = matchSpokenMove(alt(...ts), fen);
  return r.kind === 'confident' ? r.move.san : r.kind === 'ask' ? `ask:${r.options.map((m) => m.san).sort().join(',')}` : 'none';
};

describe('normaliseSpoken', () => {
  it('turns speech into compact notation', () => {
    expect(normaliseSpoken('knight to f three')).toBe('Nf3');
    expect(normaliseSpoken('Knight F3')).toBe('Nf3');
    expect(normaliseSpoken('e takes d five')).toBe('exd5');
    expect(normaliseSpoken('pawn takes d5')).toBe('Pxd5');
    expect(normaliseSpoken('bishop takes knight on f three')).toBe('Bxf3');
    expect(normaliseSpoken('castle short')).toBe('O-O');
    expect(normaliseSpoken('king side castle')).toBe('O-O');
    expect(normaliseSpoken('castles queenside')).toBe('O-O-O');
    expect(normaliseSpoken('e eight promotes to queen')).toBe('e8=Q');
  });

  it('fixes homophones', () => {
    expect(normaliseSpoken('night see three')).toBe('Nc3');
    expect(normaliseSpoken('bishop be for')).toBe('Bb4');
    expect(normaliseSpoken('rook aitch ate')).toBe('Rh8');
    expect(normaliseSpoken('queen dee won')).toBe('Qd1');
    expect(normaliseSpoken('horse g five')).toBe('Ng5');
  });

  it('reads "to" as a word, and as two only after a file', () => {
    expect(normaliseSpoken('knight to d two')).toBe('Nd2');
    expect(normaliseSpoken('knight d to')).toBe('Nd2');
  });
});

describe('matchSpokenMove', () => {
  it('matches clear moves', () => {
    expect(heard(START, 'knight f3')).toBe('Nf3');
    expect(heard(START, 'e four')).toBe('e4');
    expect(heard(START, 'pawn to e4')).toBe('e4');
    expect(heard(SCANDI, 'e takes d5')).toBe('exd5');
    expect(heard(SCANDI, 'pawn takes d five')).toBe('exd5');
    expect(heard(CASTLES, 'castle short')).toBe('O-O');
    expect(heard(CASTLES, 'castle long')).toBe('O-O-O');
  });

  it('uses the other alternatives when the first is nonsense', () => {
    expect(heard(START, 'night ref three', 'knight f three')).toBe('Nf3');
  });

  it('asks when two legal moves fit, and takes the one you name', () => {
    expect(heard(TWO_KNIGHTS, 'knight d two')).toBe('ask:Nbd2,Nfd2');
    expect(heard(TWO_KNIGHTS, 'knight b d two')).toBe('Nbd2');
    expect(heard(TWO_KNIGHTS, 'knight f3 d2')).toBe('Nfd2');
  });

  it('gives up on gibberish rather than guessing', () => {
    expect(heard(START, 'hello there')).toBe('none');
    expect(heard(START, '')).toBe('none');
  });

  it('never returns an illegal move', () => {
    for (const phrase of ['queen h5', 'king e2', 'bishop c4', 'rook a3']) {
      const r = matchSpokenMove(alt(phrase), START);
      const legal = new Chess(START).moves();
      if (r.kind === 'confident') expect(legal).toContain(r.move.san);
    }
  });
});

describe('spoken words', () => {
  it('reads moves aloud in full words', () => {
    const m = new Chess('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
    expect(squareWords('f3')).toBe('F three');
    const capture = new Chess('rnbqk1nr/pppp1ppp/8/4p3/1b2P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 3 3').move('Bxc3');
    expect(moveToWords(capture)).toBe('bishop takes knight on C three');
    expect(moveToWords(m.move('Nc6'))).toBe('knight to C six');
    expect(moveToWords(new Chess(CASTLES).move('O-O'))).toBe('castles kingside');
    expect(moveToWords(new Chess(SCANDI).move('exd5'))).toBe('E pawn takes pawn on D five');
    expect(moveToWords(new Chess('8/4P1k1/8/8/8/8/5K2/8 w - - 0 1').move('e8=Q'))).toBe('pawn to E eight, promotes to queen');
  });
});

describe('commands', () => {
  it('understands the voice commands', () => {
    expect(parseCommand('repeat')).toEqual({ kind: 'repeat' });
    expect(parseCommand('say that again')).toEqual({ kind: 'repeat' });
    expect(parseCommand('where is my bishop')).toEqual({ kind: 'where', piece: 'b' });
    expect(parseCommand("where's my knight")).toEqual({ kind: 'where', piece: 'n' });
    expect(parseCommand('list my pieces')).toEqual({ kind: 'list' });
    expect(parseCommand("what's on e5")).toEqual({ kind: 'whatsOn', square: 'e5' });
    expect(parseCommand('what is on f three')).toEqual({ kind: 'whatsOn', square: 'f3' });
    expect(parseCommand('take back')).toEqual({ kind: 'takeBack' });
    expect(parseCommand('I resign')).toEqual({ kind: 'resign' });
    expect(parseCommand('no')).toEqual({ kind: 'cancel' });
    expect(parseCommand('the second one')).toEqual({ kind: 'choice', index: 1 });
    expect(parseCommand('knight f3')).toBeNull();
  });
});
