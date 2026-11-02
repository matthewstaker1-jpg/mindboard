// Speech in and out behind small interfaces, so the Web Speech API can later
// be swapped for native (Capacitor) or cloud speech without touching game logic.

import type { Alternative } from './moveMatcher';

export interface Recogniser {
  readonly supported: boolean;
  start(): void;
  stop(): void;
  /** Called with the recogniser's alternatives for each final phrase. */
  onPhrase: ((alts: Alternative[]) => void) | null;
  onState: ((listening: boolean) => void) | null;
  onError: ((message: string) => void) | null;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onstart: (() => void) | null;
}

type Ctor = new () => SpeechRecognitionLike;

function speechCtor(): Ctor | null {
  const w = globalThis as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Browser speech recognition. Works best in Chrome; Safari and iOS are patchy. */
export class WebSpeechRecogniser implements Recogniser {
  onPhrase: Recogniser['onPhrase'] = null;
  onState: Recogniser['onState'] = null;
  onError: Recogniser['onError'] = null;
  private rec: SpeechRecognitionLike | null = null;
  private wanted = false;

  get supported() {
    return speechCtor() !== null;
  }

  start() {
    const C = speechCtor();
    if (!C) {
      this.onError?.('Speech recognition is not available in this browser. Try Chrome.');
      return;
    }
    this.wanted = true;
    if (this.rec) return;
    const r = new C();
    r.lang = 'en-US';
    r.continuous = true;
    r.interimResults = false;
    r.maxAlternatives = 5;
    r.onstart = () => this.onState?.(true);
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (!res.isFinal) continue;
        const alts: Alternative[] = [];
        for (let j = 0; j < res.length; j++) alts.push({ transcript: res[j]!.transcript, confidence: res[j]!.confidence });
        this.onPhrase?.(alts);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed') this.wanted = false;
      this.onError?.(e.error === 'not-allowed' ? 'Microphone access was blocked.' : `Speech error: ${e.error}`);
    };
    // Browsers end sessions after silence; keep listening until told to stop.
    r.onend = () => {
      this.rec = null;
      if (this.wanted) setTimeout(() => this.wanted && this.start(), 250);
      else this.onState?.(false);
    };
    this.rec = r;
    try {
      r.start();
    } catch (err) {
      this.onError?.(String(err));
    }
  }

  stop() {
    this.wanted = false;
    this.rec?.stop();
    this.rec = null;
    this.onState?.(false);
  }
}

/** Text to speech. Resolves when the phrase has been spoken. */
export class Speaker {
  get supported() {
    return typeof speechSynthesis !== 'undefined';
  }

  speak(text: string, rate = 1.05): Promise<void> {
    if (!this.supported) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = rate;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }

  cancel() {
    if (this.supported) speechSynthesis.cancel();
  }
}
