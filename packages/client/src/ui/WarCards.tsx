/**
 * Headline cards for the big moments of war (declarations, fallen cities, nuclear
 * strikes, great leaders) and the keep-or-raze choice after taking a city.
 */
import { useGame } from '../store.ts';
import { Dialog } from './Dialog.tsx';
import { LeaderPortrait } from './leaders.tsx';

const TITLES = {
  warDeclared: 'War!',
  peaceMade: 'Peace',
  cityCaptured: 'City taken',
  cityLost: 'City lost',
  cityDestroyed: 'City destroyed',
  cityRaided: 'Barbarian raid',
  nuclearStrike: 'Nuclear strike',
  leaderBorn: 'A great leader',
  playerEliminated: 'A civilization falls',
  contactMade: 'First contact',
  ceasefireEnded: 'The ceasefire is over',
  treatyBroken: 'Treachery!',
  cityRevolted: 'A city changes sides',
  barbarianLanding: 'Barbarians from the sea',
  spyCaught: 'A spy is caught',
} as const;

export function NewsCards({ onJump }: { onJump: (tile: number) => void }) {
  const news = useGame((s) => s.news);
  const dismiss = useGame((s) => s.dismissNews);
  const n = news[0];
  const civ = useGame((s) => (n?.civ !== undefined ? s.snapshot?.state.players[n.civ] : undefined));
  if (!n) return null;
  return (
    <div className={`news-card panel news-${n.kind}`} role="alert">
      <img src={`${import.meta.env.BASE_URL}art/news/${n.kind}.jpg`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
      {civ && (
        <span className="news-leader">
          <LeaderPortrait player={civ} size={64} />
        </span>
      )}
      <div className="news-body">
        <h3>{TITLES[n.kind]}</h3>
        <p>{n.text}</p>
        <div className="news-actions">
          {n.civ !== undefined && (
            <button
              onClick={() => {
                useGame.getState().open({ kind: 'diplomacy', with: n.civ! });
                dismiss();
              }}
            >
              Talk
            </button>
          )}
          {n.tile !== undefined && (
            <button
              onClick={() => {
                onJump(n.tile!);
                dismiss();
              }}
            >
              Show me
            </button>
          )}
          <button className="primary" onClick={dismiss}>
            {news.length > 1 ? `Next (${news.length - 1})` : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RazeDialog() {
  const city = useGame((s) => (s.razePrompt !== null ? s.snapshot?.state.cities[s.razePrompt] : undefined));
  const answer = useGame((s) => s.answerRaze);
  if (!city) return null;
  return (
    <Dialog title={`${city.name} is ours`} onClose={() => void answer(false)}>
      <p>
        Keep {city.name} (size {city.size}) as part of your empire, or burn it to the ground? Razing destroys the city and any wonders in it for ever.
      </p>
      <div className="dialog-actions">
        <button className="danger" onClick={() => void answer(true)}>
          Raze it
        </button>
        <button className="primary" onClick={() => void answer(false)}>
          Keep the city
        </button>
      </div>
    </Dialog>
  );
}
