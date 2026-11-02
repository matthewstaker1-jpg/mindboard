import { useEffect, useState } from 'react';
import { Gallery } from './gallery/Gallery';
import { Journey } from './screens/Journey';
import { Drill } from './screens/Drill';
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
  const drill = route.match(/^\/drill\/([\w-]+)$/);
  const level = drill ? levelById(drill[1]!) : undefined;
  // Keying by route gives each level a fresh drill.
  if (level) return <Drill key={route} level={level} />;
  return <Journey />;
}
