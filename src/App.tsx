import { useEffect, useState } from 'react';
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
  if (level) return <Drill key={route} level={level} />;
  const game = route.match(/^\/game\/([\w-]+)$/);
  const gameLevel = game ? gameLevelById(game[1]!) : undefined;
  if (gameLevel) return <FogGame key={route} level={gameLevel} />;
  return <Journey />;
}
