import { type ReactNode, useEffect, useState } from 'react';
import { Gallery } from './gallery/Gallery';
import { Journey } from './screens/Journey';
import { Drill } from './screens/Drill';
import { FogGame } from './screens/FogGame';
import { gameLevelById } from './levels/games';
import { FollowMoves } from './screens/FollowMoves';
import { Study } from './screens/Study';
import { Today } from './screens/Today';
import { VoiceLab } from './screens/VoiceLab';
import { levelById } from './levels/ladder';
import { ALL_LEVELS } from './levels/all';
import { isUnlocked } from './progress/progress';
import { useProgress } from './progress/store';

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#/, '') || '/';
}

export function App() {
  const route = useHashRoute();
  if (route === '/gallery') return <Gallery />;
  if (route === '/today') return <Today />;
  if (route === '/follow') return <FollowMoves />;
  if (route.startsWith('/study')) return <Study key={route} />;
  if (route === '/voice-lab') return <VoiceLab />;
  const drill = route.match(/^\/drill\/([\w-]+)$/);
  const level = drill ? levelById(drill[1]!) : undefined;
  // Keying by route gives each level a fresh drill.
  if (level) return <LevelGate id={level.id}>{<Drill key={route} level={level} />}</LevelGate>;
  const game = route.match(/^\/game\/([\w-]+)$/);
  const gameLevel = game ? gameLevelById(game[1]!) : undefined;
  if (gameLevel) return <LevelGate id={gameLevel.id}>{<FogGame key={route} level={gameLevel} />}</LevelGate>;
  return <Journey />;
}

/** Locked levels stay locked even when typed into the address bar. */
function LevelGate({ id, children }: { id: string; children: ReactNode }) {
  const { progress } = useProgress();
  if (!progress) return <div className="app" />;
  if (isUnlocked(progress, ALL_LEVELS.findIndex((l) => l.id === id))) return <>{children}</>;
  return (
    <div className="app locked">
      <h1>Not unlocked yet</h1>
      <p className="muted">Pass the levels before this one first, or take the placement test to skip ahead.</p>
      <a className="btn btn--primary btn--block" href="#/">
        Back to journey
      </a>
    </div>
  );
}
