/**
 * Tutorial hints (PLAN.md §12, Phase 8): the six advisors speak up once each when a
 * situation first comes up, with a line on what to do and a link to the Civilopedia.
 * Pure data and conditions on a snapshot, so the order can be tested; which hints were
 * seen lives in the browser.
 */
import { IMP_POLLUTION, IMP_ROAD, inGoldenAge, playerCities, playerUnits } from '@civolution/engine';
import type { Snapshot } from '../host/client.ts';
import { rules } from '../rules.ts';
import { needsResearch } from '../store.ts';
import { empireSummary } from './empire.ts';

export type Advisor = 'domestic' | 'trade' | 'military' | 'foreign' | 'science' | 'culture';

export const ADVISOR_NAMES: Record<Advisor, string> = {
  domestic: 'Domestic advisor',
  trade: 'Trade advisor',
  military: 'Military advisor',
  foreign: 'Foreign advisor',
  science: 'Science advisor',
  culture: 'Cultural advisor',
};

export interface Hint {
  id: string;
  advisor: Advisor;
  title: string;
  text: string;
  /** Civilopedia page for "Read more". */
  pedia?: string;
  when: (snap: Snapshot) => boolean;
}

const mine = (s: Snapshot) => playerCities(s.state, s.human);
const units = (s: Snapshot) => playerUnits(s.state, s.human);
const canDo = (s: Snapshot, action: string) => units(s).some((u) => rules.unit(u.type).specialActions.includes(action));
const hasJobs = (s: Snapshot) => units(s).some((u) => rules.unit(u.type).jobs.length > 0);

/** In the order they are checked: the first unseen hint that applies is shown. */
export const HINTS: Hint[] = [
  {
    id: 'foundCapital',
    advisor: 'domestic',
    title: 'Found your capital',
    text: 'Your settlers wait for a home. Select them and press B to found a city where you stand; a river, the coast or a hill make a fine site. Every turn you wait is a turn of growth lost.',
    pedia: 'concepts/cities',
    when: (s) => mine(s).length === 0 && canDo(s, 'buildCity'),
  },
  {
    id: 'firstCity',
    advisor: 'domestic',
    title: 'Your first city',
    text: 'Click the city to open it. Pick what it builds: a warrior to guard it, then settlers to spread out and workers to improve the land. Citizens work the best tiles on their own; you can move them.',
    pedia: 'concepts/tiles',
    when: (s) => mine(s).length === 1,
  },
  {
    id: 'research',
    advisor: 'science',
    title: 'Choose what to learn',
    text: 'Our scholars need a direction. The science advisor (F6) shows what each advance opens; Bronze Working, Alphabet and Pottery are good first steps. Set a research goal and the advances on the way are chosen for you.',
    pedia: 'concepts/science',
    when: (s) => needsResearch(s),
  },
  {
    id: 'civilopedia',
    advisor: 'culture',
    title: 'The Civilopedia',
    text: 'Every unit, building, advance and rule has a page in the Civilopedia. Open it with F10 or any small "?" next to a name, and search with the / key.',
    pedia: '',
    when: (s) => s.state.turn >= 3,
  },
  {
    id: 'workers',
    advisor: 'domestic',
    title: 'Improve the land',
    text: 'Workers irrigate grassland and plains for food, mine hills for shields and build roads for commerce and speed. Press A to let a worker choose its own jobs, or give orders yourself.',
    pedia: 'concepts/workers',
    when: (s) => hasJobs(s) && mine(s).length > 0,
  },
  {
    id: 'expand',
    advisor: 'domestic',
    title: 'Spread out',
    text: 'Land is power. Cities grow faster when they are small, so train settlers in your capital and claim the good sites before your neighbours do. Three tiles between cities wastes little land.',
    pedia: 'concepts/cities',
    when: (s) => s.state.turn >= 15 && mine(s).length < 3,
  },
  {
    id: 'starving',
    advisor: 'domestic',
    title: 'A city is starving',
    text: 'One of our cities eats more than it grows. Open it and work a tile with more food, or irrigate the land around it. When the food box runs empty, the city shrinks.',
    pedia: 'concepts/tiles',
    when: (s) => empireSummary(s).cities.some((c) => c.report.foodSurplus < 0),
  },
  {
    id: 'disorder',
    advisor: 'domestic',
    title: 'Civil disorder',
    text: 'A city has more unhappy citizens than happy ones and produces nothing. Turn a worker into an entertainer, raise the luxury rate, or build a temple. A governor can keep order for you.',
    pedia: 'concepts/happiness',
    when: (s) => empireSummary(s).cities.some((c) => c.report.disorder),
  },
  {
    id: 'unhappy',
    advisor: 'domestic',
    title: 'Grumbling in the streets',
    text: 'As cities grow, more citizens are born unhappy. Temples, luxuries from wine or silk, and the luxury rate keep them content. Watch the faces on the city screen.',
    pedia: 'concepts/happiness',
    when: (s) => empireSummary(s).cities.some((c) => c.report.unhappy > 0),
  },
  {
    id: 'roads',
    advisor: 'trade',
    title: 'Connect your cities',
    text: 'Roads between cities carry trade: a luxury or strategic resource reaches every city on the network, and the capital is in touch with the rest of the empire.',
    pedia: 'concepts/trade',
    when: (s) => {
      const cities = mine(s);
      if (cities.length < 2) return false;
      const centres = new Set(cities.map((c) => c.tile));
      const m = s.state.map;
      // No road of ours outside the city centres yet.
      return !m.improvements.some((x, t) => (x & IMP_ROAD) !== 0 && m.territory[t] === s.human && !centres.has(t));
    },
  },
  {
    id: 'contact',
    advisor: 'foreign',
    title: 'We are not alone',
    text: 'We have met another civilization. Diplomacy (F4) lets you trade advances, resources and maps, and sign treaties. Keep your word: broken treaties are remembered by everyone.',
    pedia: 'concepts/diplomacy',
    when: (s) => s.state.players[s.human]!.contacts.length > 0,
  },
  {
    id: 'war',
    advisor: 'military',
    title: 'We are at war',
    text: 'Guard every city with its best defender, fortified (F). Attack with units strong in attack, and look at the odds before you strike. Hills, rivers and walls favour the defender.',
    pedia: 'concepts/combat',
    when: (s) => s.state.players[s.human]!.atWarWith.some((x) => s.state.players[x]?.alive && !s.state.players[x].barbarian),
  },
  {
    id: 'government',
    advisor: 'domestic',
    title: 'A better government',
    text: 'We know a better way to rule than despotism. A revolution brings a few turns of anarchy, then less corruption and no penalty on rich tiles. Start one from the domestic advisor (F1).',
    pedia: 'concepts/governments',
    when: (s) => {
      const p = s.state.players[s.human]!;
      return p.government === rules.set.general.defaultGovernment && rules.set.governments.some((g) => !g.transitional && g.id !== p.government && g.requiredTech && p.techs.includes(g.requiredTech));
    },
  },
  {
    id: 'automation',
    advisor: 'domestic',
    title: 'Let your governors help',
    text: 'A growing empire means many small decisions. The automation screen (F7) hands citizens, builds, workers or research to governors who explain every choice; the turn digest (F9) lists what still needs you.',
    pedia: 'concepts/automation',
    when: (s) => mine(s).length >= 5,
  },
  {
    id: 'corruption',
    advisor: 'trade',
    title: 'Corruption in far cities',
    text: 'Cities far from the palace lose commerce to corruption and shields to waste. Courthouses fight it, and a better government helps most of all.',
    pedia: 'concepts/corruption',
    when: (s) => empireSummary(s).cities.some((c) => c.report.corruptionRate.value >= 40),
  },
  {
    id: 'culture',
    advisor: 'culture',
    title: 'Culture spreads your borders',
    text: 'Temples, libraries and wonders earn culture each turn. Culture widens your borders, makes rivals respect you, and can even win cities over to your side.',
    pedia: 'concepts/culture',
    when: (s) => mine(s).some((c) => Object.keys(c.buildings).some((b) => rules.building(b).culture > 0)),
  },
  {
    id: 'goldenAge',
    advisor: 'culture',
    title: 'A golden age',
    text: 'Our people are inspired: for the next turns every productive tile yields an extra shield and an extra commerce. Use it to build wonders and push research.',
    pedia: 'concepts/goldenAges',
    when: (s) => inGoldenAge(s.state, s.human),
  },
  {
    id: 'pollution',
    advisor: 'domestic',
    title: 'Pollution',
    text: 'Factories and big cities foul the land around them, cutting its yields. Send workers to clean it up (Shift+K), and build mass transit and recycling centres. Left alone, pollution warms the world.',
    pedia: 'concepts/pollution',
    when: (s) => s.state.map.improvements.some((x, t) => (x & IMP_POLLUTION) !== 0 && s.state.map.territory[t] === s.human),
  },
  {
    id: 'victory',
    advisor: 'culture',
    title: 'The road to victory',
    text: 'There is more than one way to win: conquest, domination, culture, the United Nations or the race to space. The victory screen (F8) shows how close everyone is.',
    pedia: 'concepts/victory',
    when: (s) => s.state.turn >= 60,
  },
];

/** The hint to show now, if any. */
export function nextHint(snap: Snapshot, seen: ReadonlySet<string>): Hint | null {
  for (const h of HINTS) if (!seen.has(h.id) && h.when(snap)) return h;
  return null;
}

const KEY = 'civolution.hints.seen';
/** Fired on the window when the seen hints change (so a reset in the settings shows them again). */
export const HINTS_CHANGED = 'civolution:hints';

export function readSeenHints(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function writeSeenHints(seen: ReadonlySet<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // Not remembered; the hint may show again next session.
  }
  window.dispatchEvent(new Event(HINTS_CHANGED));
}
