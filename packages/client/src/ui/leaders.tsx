/**
 * Leader portraits and names for civilizations (art/leaders/<civ>.jpg, generated for the
 * project). Players without a civilization get an initial in their colour.
 */
import { useState } from 'react';
import type { AttitudeLevel, Player } from '@civolution/engine';
import { rules } from '../rules.ts';

export function leaderName(p: Player): string {
  if (!p.civ) return p.name;
  const c = rules.civ(p.civ);
  return `${c.leaderTitle} ${c.leader}`;
}

/** "Rome (the Romans)", or the player's name. */
export function civTitle(p: Player): string {
  if (!p.civ) return p.name;
  const c = rules.civ(p.civ);
  return `${c.name} (the ${c.noun})`;
}

export function LeaderPortrait({ player, size, mood }: { player: Player; size: number; mood?: AttitudeLevel }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, borderColor: player.color };
  const cls = `leader-portrait ${mood ? `mood-${mood}` : ''}`;
  if (player.barbarian && !failed) {
    return <img className={cls} style={style} src={`${import.meta.env.BASE_URL}art/leaders/barbarians.jpg`} alt={player.name} onError={() => setFailed(true)} />;
  }
  if (!player.civ || failed) {
    return (
      <span className={`${cls} initial`} style={{ ...style, background: player.color, fontSize: size * 0.42 }} aria-hidden>
        {player.name.slice(0, 1)}
      </span>
    );
  }
  return <img className={cls} style={style} src={`${import.meta.env.BASE_URL}art/leaders/${player.civ}.jpg`} alt={leaderName(player)} onError={() => setFailed(true)} />;
}
