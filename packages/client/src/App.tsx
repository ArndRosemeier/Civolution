import { useEffect, useState } from 'react';
import { GameScreen } from './ui/GameScreen.tsx';
import { NewGameDialog } from './ui/NewGameDialog.tsx';
import { SavesDialog } from './ui/SavesDialog.tsx';
import { useGame } from './store.ts';
import { BenchScreen } from './bench/BenchScreen.tsx';
import { WhatsNew } from './ui/WhatsNew.tsx';
import { VERSION } from './version.ts';

type Screen = 'title' | 'new' | 'load' | 'news' | 'game';

export function App() {
  const params = new URLSearchParams(location.search);
  const snapshot = useGame((s) => s.snapshot);
  const [screen, setScreen] = useState<Screen>('title');
  const [art, setArt] = useState(false);
  useEffect(() => {
    // Title art is generated (docs/assets.md); without it the gradient stays.
    const img = new Image();
    img.onload = () => setArt(true);
    img.src = `${import.meta.env.BASE_URL}art/title.jpg`;
  }, []);
  useEffect(() => {
    if (snapshot) setScreen('game');
  }, [snapshot]);
  if (params.has('bench')) return <BenchScreen size={params.get('size') ?? 'huge'} units={Number(params.get('units') ?? 500)} />;
  if (screen === 'game' && snapshot) return <GameScreen />;
  return (
    <div className={`title-screen ${art ? 'with-art' : ''}`}>
      <div className="title-card">
        <h1>Civolution</h1>
        <p className="subtitle">Build an empire to stand the test of time.</p>
        <div className="title-actions">
          <button className="primary" onClick={() => setScreen('new')}>New game</button>
          <button onClick={() => setScreen('load')}>Load game</button>
          <button onClick={() => setScreen('news')}>What’s new</button>
          <a className="button" href="?bench">Map benchmark</a>
        </div>
      </div>
      <button className="version-tag" onClick={() => setScreen('news')} title="Version history">
        Alpha {VERSION}
      </button>
      {screen === 'new' && <NewGameDialog onClose={() => setScreen('title')} />}
      {screen === 'load' && <SavesDialog mode="load" onClose={() => setScreen('title')} />}
      {screen === 'news' && <WhatsNew onClose={() => setScreen('title')} />}
    </div>
  );
}
