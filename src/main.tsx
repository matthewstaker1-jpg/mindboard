import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/ui.css';
import { App } from './App';
import { preloadEngine } from './engine/engine';
import { loadContent } from './content/content';

// Start downloading the engine straight away; games show the progress.
void preloadEngine();
void loadContent();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
