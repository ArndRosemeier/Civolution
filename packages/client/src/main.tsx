import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { installClickSounds } from './audio.ts';
import './styles.css';
import './cities.css';
import './war.css';
import './automation.css';
import './victory.css';

installClickSounds();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
