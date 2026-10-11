import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { installClickSounds } from './audio.ts';
import { useGame } from './store.ts';
import { applySettings } from './ui/a11y.ts';
import './pedia.css';
import './styles.css';
import './cities.css';
import './war.css';
import './automation.css';
import './victory.css';

installClickSounds();
applySettings(useGame.getState().settings);
useGame.subscribe((s, prev) => s.settings !== prev.settings && applySettings(s.settings));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
