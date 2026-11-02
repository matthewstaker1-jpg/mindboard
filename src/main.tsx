import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/ui.css';
import { App } from './App';
import { preloadEngine } from './engine/engine';

// Start downloading the engine straight away; games show the progress.
void preloadEngine();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
