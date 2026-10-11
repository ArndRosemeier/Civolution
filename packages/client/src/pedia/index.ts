/**
 * The Civilopedia (PLAN.md §10.2): a page for every unit, building, advance, government,
 * terrain, resource, worker job, civilization, trait, specialist, era, level and game
 * concept. Facts come from the rule set, so they always match the game; the prose in
 * text/*.json is written for this project (never the original's).
 */
import { rules } from '../rules.ts';
import unitText from './text/units.json';
import buildingText from './text/buildings.json';
import worldText from './text/world.json';
import conceptText from './text/concepts.json';

export type PediaCategory =
  | 'concepts'
  | 'civs'
  | 'traits'
  | 'units'
  | 'buildings'
  | 'wonders'
  | 'techs'
  | 'eras'
  | 'governments'
  | 'specialists'
  | 'terrains'
  | 'resources'
  | 'workerJobs'
  | 'experienceLevels'
  | 'difficulties';

export const CATEGORIES: { id: PediaCategory; name: string }[] = [
  { id: 'concepts', name: 'Game concepts' },
  { id: 'civs', name: 'Civilizations' },
  { id: 'traits', name: 'Traits' },
  { id: 'units', name: 'Units' },
  { id: 'buildings', name: 'City improvements' },
  { id: 'wonders', name: 'Wonders' },
  { id: 'techs', name: 'Advances' },
  { id: 'eras', name: 'Eras' },
  { id: 'governments', name: 'Governments' },
  { id: 'specialists', name: 'Citizens' },
  { id: 'terrains', name: 'Terrain' },
  { id: 'resources', name: 'Resources' },
  { id: 'workerJobs', name: 'Worker jobs' },
  { id: 'experienceLevels', name: 'Experience' },
  { id: 'difficulties', name: 'Difficulty levels' },
];

/** A link inside a fact: shown as text, opens `to` ("units/warrior") when clicked. */
export interface PediaLinkRef {
  label: string;
  to: string;
}

export type FactValue = string | number | PediaLinkRef | (string | PediaLinkRef)[];

export interface PediaEntry {
  /** "units/warrior" */
  key: string;
  category: PediaCategory;
  id: string;
  name: string;
  /** A short line under the title. */
  subtitle: string;
  art?: string;
  /** Wide pictures (concepts, eras, terrain) are shown as a banner. */
  wideArt?: boolean;
  facts: [string, FactValue][];
  /** Paragraphs; may hold [label](pedia:category/id) links. */
  text: string;
}

const base = (path: string) => `${import.meta.env.BASE_URL}art/${path}`;
const link = (category: PediaCategory, id: string, label?: string): PediaLinkRef => ({ to: `${category}/${id}`, label: label ?? nameOf(category, id) });
const pretty = (id: string) => id.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const pct = (n: number) => `${n > 0 ? '+' : ''}${n}%`;

interface ConceptText {
  civs: Record<string, string>;
  traits: Record<string, string>;
  concepts: Record<string, { title: string; summary: string; body: string }>;
}
interface WorldText {
  techs: Record<string, string>;
  eras: Record<string, string>;
  terrains: Record<string, string>;
  resources: Record<string, string>;
  workerJobs: Record<string, string>;
  experienceLevels: Record<string, string>;
  difficulties: Record<string, string>;
}
interface BuildingText {
  buildings: Record<string, string>;
  governments: Record<string, string>;
  specialists: Record<string, string>;
}
const units = unitText as Record<string, string>;
const buildingsT = buildingText as BuildingText;
const world = worldText as WorldText;
const concepts = conceptText as ConceptText;

/** The page a unit type shows: numbered rule-file copies (impi128) show the original. */
export function unitPage(type: string): string {
  const original = type.replace(/\d{3}$/, '');
  return original && original !== type && rules.hasUnit(original) ? original : type;
}

function isWonder(id: string): boolean {
  const k = rules.building(id).kind;
  return k === 'wonder' || k === 'smallWonder';
}

/** The category a building's page is in. */
export function buildingCategory(id: string): PediaCategory {
  return isWonder(id) ? 'wonders' : 'buildings';
}

function traitIds(): string[] {
  return [...new Set(rules.set.civs.flatMap((c) => c.traits))].sort();
}

function nameOf(category: PediaCategory, id: string): string {
  switch (category) {
    case 'units':
      return rules.hasUnit(id) ? rules.unit(id).name : pretty(id);
    case 'buildings':
    case 'wonders':
      return rules.hasBuilding(id) ? rules.building(id).name : pretty(id);
    case 'techs':
      return rules.set.techs.find((t) => t.id === id)?.name ?? pretty(id);
    case 'governments':
      return rules.set.governments.find((t) => t.id === id)?.name ?? pretty(id);
    case 'civs':
      return rules.set.civs.find((c) => c.id === id)?.name ?? pretty(id);
    case 'terrains':
      return rules.terrains.find((t) => t.id === id)?.name ?? pretty(id);
    case 'resources':
      return rules.resources.find((t) => t.id === id)?.name ?? pretty(id);
    case 'workerJobs':
      return rules.set.workerJobs.find((t) => t.id === id)?.name ?? pretty(id);
    case 'specialists':
      return rules.set.specialists.find((t) => t.id === id)?.name ?? pretty(id);
    case 'eras':
      return rules.set.eras.find((t) => t.id === id)?.name ?? pretty(id);
    case 'experienceLevels':
      return rules.set.experienceLevels.find((t) => t.id === id)?.name ?? pretty(id);
    case 'difficulties':
      return rules.set.difficulties.find((t) => t.id === id)?.name ?? pretty(id);
    case 'concepts':
      return concepts.concepts[id]?.title ?? pretty(id);
    case 'traits':
      return pretty(id);
  }
}

/** Civilizations that may build a unit, when not everyone may (unique units and kings). */
function unitOwners(id: string): string[] | null {
  const u = rules.unit(id);
  const civs = rules.set.civs.filter((c) => (u.availableToMask >>> c.unitBit) & 1);
  if (civs.length === rules.set.civs.length) return null;
  const king = rules.set.civs.filter((c) => c.kingUnit === id);
  return (king.length > 0 ? king : civs).map((c) => c.id);
}

/**
 * What a unit upgrades to, as the engine sees it: the rule file's chain skips other
 * civilizations' unique units (a legionary becomes medieval infantry, not immortals).
 */
export function upgradeOf(id: string): string | undefined {
  const owners = unitOwners(id);
  let next = rules.unit(id).upgradeTo;
  for (let guard = 0; next && rules.hasUnit(next) && guard < 20; guard++) {
    const theirs = unitOwners(next);
    if (theirs === null || (owners !== null && theirs.some((c) => owners.includes(c)))) return next;
    next = rules.unit(next).upgradeTo;
  }
  return undefined;
}

function unitFacts(id: string): [string, FactValue][] {
  const u = rules.unit(id);
  const f: [string, FactValue][] = [];
  f.push(['Kind', `${pretty(u.domain)} unit`]);
  f.push(['Attack / defence / moves', `${u.attack} / ${u.defence} / ${u.movement}`]);
  if (u.shieldCost > 0) f.push(['Cost', `${u.shieldCost} shields${u.populationCost > 0 ? `, ${u.populationCost} citizen${u.populationCost === 1 ? '' : 's'}` : ''}`]);
  if (u.hitPointBonus) f.push(['Extra hit points', u.hitPointBonus]);
  if (u.bombardStrength > 0) f.push(['Bombard', `strength ${u.bombardStrength}, range ${u.bombardRange}, rate of fire ${u.rateOfFire}`]);
  if (u.airDefence > 0) f.push(['Air defence', u.airDefence]);
  if (u.operationalRange > 0) f.push(['Range', `${u.operationalRange} tiles`]);
  if (u.capacity > 0) f.push(['Carries', `${u.capacity} unit${u.capacity === 1 ? '' : 's'}`]);
  if (u.requiredTech) f.push(['Requires', link('techs', u.requiredTech)]);
  if (u.requiredResources.length) f.push(['Needs', u.requiredResources.map((r) => link('resources', r))]);
  const up = upgradeOf(id);
  if (up) f.push(['Upgrades to', link('units', up)]);
  const from = rules.set.units.filter((x) => !/\d{3}$/.test(x.id) && upgradeOf(x.id) === id).map((x) => link('units', x.id));
  if (from.length) f.push(['Upgraded from', from]);
  const owners = unitOwners(id);
  if (owners) f.push([rules.set.civs.some((c) => c.kingUnit === id) ? 'King of' : 'Only for', owners.map((c) => link('civs', c))]);
  if (u.jobs.length) f.push(['Worker jobs', u.jobs.map((j) => link('workerJobs', j))]);
  const abilities = u.abilities.filter((a) => a !== 'rangedAttackAnimations' && a !== 'unusedMounted');
  if (abilities.length) f.push(['Abilities', abilities.map(pretty).join(', ')]);
  if (!u.requiresSupport) f.push(['Support', 'free']);
  return f;
}

function buildingFacts(id: string): [string, FactValue][] {
  const b = rules.building(id);
  const f: [string, FactValue][] = [];
  f.push(['Kind', b.kind === 'wonder' ? 'Great wonder' : b.kind === 'smallWonder' ? 'Small wonder' : b.kind === 'wealth' ? 'Converts shields to gold' : 'City improvement']);
  if (b.cost > 0) f.push(['Cost', `${b.cost} shields`]);
  if (b.upkeep > 0) f.push(['Upkeep', `${b.upkeep} gold a turn`]);
  if (b.culture > 0) f.push(['Culture', `${b.culture} a turn`]);
  if (b.requiredTech) f.push(['Requires', link('techs', b.requiredTech)]);
  if (b.requiredBuilding) f.push(['Needs in the city', `${link(buildingCategory(b.requiredBuilding), b.requiredBuilding).label}${b.requiredCount > 1 ? ` in ${b.requiredCount} cities` : ''}`]);
  if (b.requiredGovernment) f.push(['Government', link('governments', b.requiredGovernment)]);
  if (b.requiredResources.length) f.push(['Needs', b.requiredResources.map((r) => link('resources', r))]);
  if (b.obsoletedBy) f.push(['Obsolete with', link('techs', b.obsoletedBy)]);
  if (b.contentFaces) f.push(['Content faces', b.contentFaces]);
  if (b.contentFacesElsewhere) f.push(['Content faces in every city', b.contentFacesElsewhere]);
  if (b.productionPercent) f.push(['Production', pct(b.productionPercent)]);
  if (b.pollution) f.push(['Pollution', b.pollution]);
  if (b.defenceBonus) f.push(['Defence', pct(b.defenceBonus)]);
  if (b.navalDefenceBonus) f.push(['Defence against ships', pct(b.navalDefenceBonus)]);
  if (b.doublesContentOf) f.push(['Doubles the effect of', link(buildingCategory(b.doublesContentOf), b.doublesContentOf)]);
  if (b.actsAsEverywhere) f.push(['Acts as in every city', link(buildingCategory(b.actsAsEverywhere), b.actsAsEverywhere)]);
  if (b.actsAsOnContinent) f.push(['Acts as on its continent', link(buildingCategory(b.actsAsOnContinent), b.actsAsOnContinent)]);
  if (b.unitProduced && rules.hasUnit(b.unitProduced)) f.push(['Produces', `${link('units', b.unitProduced).label} every ${b.unitEvery} turns`]);
  if (b.spaceshipParts) f.push(['Spaceship parts', b.spaceshipParts]);
  if (b.effects.length) f.push(['Effects', b.effects.map(pretty).join(', ')]);
  const needed = rules.set.buildings.filter((x) => x.requiredBuilding === id).map((x) => link(buildingCategory(x.id), x.id));
  if (needed.length) f.push(['Needed for', needed]);
  return f;
}

function techFacts(id: string): [string, FactValue][] {
  const t = rules.tech(id);
  const f: [string, FactValue][] = [['Era', link('eras', t.era)]];
  if (t.prerequisites.length) f.push(['Requires', t.prerequisites.map((p) => link('techs', p))]);
  const leads = rules.set.techs.filter((x) => x.prerequisites.includes(id)).map((x) => link('techs', x.id));
  if (leads.length) f.push(['Leads to', leads]);
  const unitsU = rules.set.units.filter((u) => u.requiredTech === id && !/\d{3}$/.test(u.id) && !rules.set.civs.some((c) => c.kingUnit === u.id)).map((u) => link('units', u.id));
  if (unitsU.length) f.push(['Units', unitsU]);
  const bs = rules.set.buildings.filter((b) => b.requiredTech === id).map((b) => link(buildingCategory(b.id), b.id));
  if (bs.length) f.push(['Buildings', bs]);
  const govs = rules.set.governments.filter((g) => g.requiredTech === id).map((g) => link('governments', g.id));
  if (govs.length) f.push(['Government', govs]);
  const jobs = rules.set.workerJobs.filter((j) => j.requiredTech === id).map((j) => link('workerJobs', j.id));
  if (jobs.length) f.push(['Worker jobs', jobs]);
  const res = rules.resources.filter((r) => r.revealedBy === id).map((r) => link('resources', r.id));
  if (res.length) f.push(['Reveals', res]);
  const old = rules.set.buildings.filter((b) => b.obsoletedBy === id).map((b) => link(buildingCategory(b.id), b.id));
  if (old.length) f.push(['Makes obsolete', old]);
  return f;
}

const CORRUPTION: Record<string, string> = {
  minimal: 'minimal',
  nuisance: 'a nuisance',
  problematic: 'problematic',
  rampant: 'rampant',
  catastrophic: 'catastrophic',
  communal: 'the same everywhere',
  off: 'none',
};

function governmentFacts(id: string): [string, FactValue][] {
  const g = rules.government(id);
  const f: [string, FactValue][] = [];
  if (g.requiredTech) f.push(['Requires', link('techs', g.requiredTech)]);
  f.push(['Corruption', CORRUPTION[g.corruption] ?? g.corruption]);
  f.push(['War weariness', g.warWeariness]);
  f.push(['Hurrying', g.hurry === 'none' ? 'not possible' : g.hurry === 'gold' ? 'with gold' : 'with citizens (forced labour)']);
  f.push(['Free units', `${g.freeUnits.town} per town, ${g.freeUnits.city} per city, ${g.freeUnits.metropolis} per metropolis`]);
  f.push(['Unit cost', `${g.unitCost} gold beyond the free ones`]);
  f.push(['Worker rate', g.workerRate]);
  if (g.rateCap < 100) f.push(['Rate limit', `${g.rateCap}%`]);
  if (g.militaryPoliceLimit) f.push(['Military police', `up to ${g.militaryPoliceLimit} units`]);
  if (g.tilePenalty) f.push(['Tile penalty', 'tiles yielding more than 2 lose one']);
  if (g.commerceBonus) f.push(['Commerce bonus', '+1 on tiles that already yield commerce']);
  if (!g.buildingUpkeep) f.push(['Building upkeep', 'none']);
  return f;
}

function terrainFacts(id: string): [string, FactValue][] {
  const t = rules.terrains[rules.terrainIndex(id)]!;
  const f: [string, FactValue][] = [['Food / shields / commerce', `${t.food} / ${t.shields} / ${t.commerce}`]];
  if (t.irrigationFood) f.push(['Irrigation', `+${t.irrigationFood} food`]);
  if (t.mineShields) f.push(['Mine', `+${t.mineShields} shields`]);
  if (t.roadCommerce) f.push(['Road', `+${t.roadCommerce} commerce`]);
  if (!t.water) f.push(['Movement cost', t.movementCost]);
  if (t.defenceBonus) f.push(['Defence', pct(t.defenceBonus)]);
  if (!t.water) f.push(['Cities', t.canFoundCity ? 'may be founded here' : 'cannot be founded here']);
  if (t.impassable) f.push(['Passable', 'no']);
  else if (t.impassableToWheeled) f.push(['Wheeled units', 'cannot enter']);
  if (t.possibleResources.length) f.push(['Resources', t.possibleResources.filter((r) => rules.resourceIndex(r) >= 0).map((r) => link('resources', r))]);
  if (t.transform) f.push(['Workers can', `${nameOf('workerJobs', t.transform.job)} to make it ${nameOf('terrains', t.transform.result)}`]);
  return f;
}

function resourceFacts(id: string): [string, FactValue][] {
  const r = rules.resources[rules.resourceIndex(id)]!;
  const f: [string, FactValue][] = [['Kind', pretty(r.kind)]];
  const bonus = [r.food && `+${r.food} food`, r.shields && `+${r.shields} shields`, r.commerce && `+${r.commerce} commerce`].filter(Boolean).join(', ');
  if (bonus) f.push(['Tile bonus', bonus]);
  if (r.revealedBy) f.push(['Seen with', link('techs', r.revealedBy)]);
  const where = rules.terrains.filter((t) => t.possibleResources.includes(id)).map((t) => link('terrains', t.id));
  if (where.length) f.push(['Found on', where]);
  const needU = rules.set.units.filter((u) => u.requiredResources.includes(id) && !/\d{3}$/.test(u.id)).map((u) => link('units', u.id));
  if (needU.length) f.push(['Needed for units', needU]);
  const needB = rules.set.buildings.filter((b) => b.requiredResources.includes(id)).map((b) => link(buildingCategory(b.id), b.id));
  if (needB.length) f.push(['Needed for buildings', needB]);
  const needJ = rules.set.workerJobs.filter((j) => j.requiredResources.includes(id)).map((j) => link('workerJobs', j.id));
  if (needJ.length) f.push(['Needed for worker jobs', needJ]);
  return f;
}

function civFacts(id: string): [string, FactValue][] {
  const c = rules.civ(id);
  const f: [string, FactValue][] = [['Leader', `${c.leaderTitle} ${c.leader}`]];
  f.push(['Traits', c.traits.map((t) => link('traits', t))]);
  if (c.uniqueUnits.length) f.push(['Unique unit', c.uniqueUnits.map((u) => link('units', u))]);
  if (c.kingUnit) f.push(['King (regicide)', link('units', c.kingUnit)]);
  if (c.freeTechs.length) f.push(['Starts with', c.freeTechs.map((t) => link('techs', t))]);
  if (c.favoriteGovernment) f.push(['Favours', link('governments', c.favoriteGovernment)]);
  if (c.shunnedGovernment) f.push(['Shuns', link('governments', c.shunnedGovernment)]);
  f.push(['Temper', ['very peaceful', 'peaceful', 'balanced', 'aggressive', 'very aggressive'][c.aggression + 2]!]);
  f.push(['Culture group', pretty(c.cultureGroup)]);
  if (c.cityNames.length) f.push(['First cities', c.cityNames.slice(0, 4).join(', ')]);
  return f;
}

function jobFacts(id: string): [string, FactValue][] {
  const j = rules.job(id);
  const f: [string, FactValue][] = [['Base time', `${j.baseTurns} worker-turns`]];
  if (j.requiredTech) f.push(['Requires', link('techs', j.requiredTech)]);
  if (j.requiredResources.length) f.push(['Needs', j.requiredResources.map((r) => link('resources', r))]);
  const by = rules.set.units.filter((u) => u.jobs.includes(id) && !/\d{3}$/.test(u.id)).map((u) => link('units', u.id));
  if (by.length) f.push(['Done by', by]);
  return f;
}

function specialistFacts(id: string): [string, FactValue][] {
  const s = rules.specialist(id);
  const f: [string, FactValue][] = [];
  if (s.requiredTech) f.push(['Requires', link('techs', s.requiredTech)]);
  const gives = [s.luxury && `${s.luxury} luxury`, s.science && `${s.science} science`, s.gold && `${s.gold} gold`, s.shields && `${s.shields} shields`, s.corruption && `${s.corruption} less corruption`].filter(Boolean).join(', ');
  if (gives) f.push(['Each gives', gives]);
  return f;
}

function difficultyFacts(id: string): [string, FactValue][] {
  const d = rules.difficulty(id);
  return [
    ['Content citizens', `${d.contentCitizens} per city`],
    ['Rivals research at', `${d.costFactor * 10}% of the normal cost`],
    ['Rival bonus units', `${d.aiDefensiveStartUnits} defensive, ${d.aiOffensiveStartUnits} offensive at the start`],
    ['Most anarchy', `${d.maxAnarchyTurns} turns`],
  ];
}

function experienceFacts(id: string): [string, FactValue][] {
  const x = rules.set.experienceLevels.find((e) => e.id === id)!;
  return [
    ['Hit points', x.hitPoints],
    ['Retreat chance', `${x.retreatChance}%`],
  ];
}

const textOf = (category: PediaCategory, id: string): string => {
  switch (category) {
    case 'units':
      return units[id] ?? '';
    case 'buildings':
    case 'wonders':
      return buildingsT.buildings[id] ?? '';
    case 'governments':
      return buildingsT.governments[id] ?? '';
    case 'specialists':
      return buildingsT.specialists[id] ?? '';
    case 'civs':
      return concepts.civs[id] ?? '';
    case 'traits':
      return concepts.traits[id] ?? '';
    case 'concepts':
      return concepts.concepts[id]?.body ?? '';
    default:
      return (world[category] as Record<string, string> | undefined)?.[id] ?? '';
  }
};

let all: PediaEntry[] | null = null;

/** Every page, in category order then by name (concepts in their written order). */
export function pediaEntries(): PediaEntry[] {
  if (all) return all;
  const out: PediaEntry[] = [];
  const add = (category: PediaCategory, id: string, subtitle: string, facts: [string, FactValue][], art?: string, wideArt?: boolean) =>
    out.push({ key: `${category}/${id}`, category, id, name: nameOf(category, id), subtitle, facts, text: textOf(category, id), ...(art ? { art } : {}), ...(wideArt ? { wideArt } : {}) });
  for (const [id, c] of Object.entries(concepts.concepts)) add('concepts', id, c.summary, [], base(`pedia/${id}.jpg`), true);
  for (const c of rules.set.civs) add('civs', c.id, `${c.adjective} · led by ${c.leader}`, civFacts(c.id), base(`leaders/${c.id}.jpg`));
  for (const t of traitIds()) {
    const civs = rules.set.civs.filter((c) => c.traits.includes(t)).map((c) => link('civs', c.id));
    add('traits', t, 'Civilization trait', [['Civilizations', civs]], base(`traits/${t}.png`));
  }
  for (const u of rules.set.units) {
    if (unitPage(u.id) !== u.id) continue;
    add('units', u.id, `${u.attack}/${u.defence}/${u.movement} · ${u.shieldCost} shields`, unitFacts(u.id), unitArtFor(u.id));
  }
  for (const b of rules.set.buildings) add(buildingCategory(b.id), b.id, b.kind === 'wonder' ? 'Great wonder' : b.kind === 'smallWonder' ? 'Small wonder' : 'City improvement', buildingFacts(b.id), base(`buildings/${b.id}.png`));
  for (const t of rules.set.techs) add('techs', t.id, `${nameOf('eras', t.era)} advance`, techFacts(t.id), base(`techs/${t.id}.png`));
  for (const e of rules.set.eras) {
    const techs = rules.set.techs.filter((t) => t.era === e.id).map((t) => link('techs', t.id));
    add('eras', e.id, 'Era', [['Advances', techs]], base(`eras/${e.id}.jpg`), true);
  }
  for (const g of rules.set.governments) add('governments', g.id, g.transitional ? 'Between governments' : 'Government', governmentFacts(g.id), base(`governments/${g.id}.png`));
  for (const s of rules.set.specialists) add('specialists', s.id, s.laborer ? 'Working citizen' : 'Specialist', specialistFacts(s.id), base(`people/${s.id}.png`));
  for (const t of rules.terrains) add('terrains', t.id, t.water ? 'Water' : 'Land', terrainFacts(t.id), t.water ? undefined : base(`terrain/${t.id}.jpg`));
  for (const r of rules.resources) add('resources', r.id, `${pretty(r.kind)} resource`, resourceFacts(r.id), base(`resources/${r.id}.png`));
  for (const j of rules.set.workerJobs) add('workerJobs', j.id, 'Worker job', jobFacts(j.id), base(`jobs/${j.id}.png`));
  for (const x of rules.set.experienceLevels) add('experienceLevels', x.id, 'Experience level', experienceFacts(x.id), base(`experience/${x.id}.png`));
  for (const d of rules.set.difficulties) add('difficulties', d.id, 'Difficulty level', difficultyFacts(d.id));
  const order = new Map(CATEGORIES.map((c, i) => [c.id, i]));
  all = out.sort((a, b) => order.get(a.category)! - order.get(b.category)! || (a.category === 'concepts' || a.category === 'eras' || a.category === 'difficulties' || a.category === 'experienceLevels' ? 0 : a.name.localeCompare(b.name)));
  return all;
}

function unitArtFor(id: string): string {
  const king = rules.set.civs.find((c) => c.kingUnit === id);
  return king ? base(`leaders/${king.id}.jpg`) : base(`units/${id}.png`);
}

let byKey: Map<string, PediaEntry> | null = null;

/** A page by key ("units/warrior"); a building asked for under the wrong category still finds its page. */
export function pediaEntry(key: string): PediaEntry | undefined {
  byKey ??= new Map(pediaEntries().map((e) => [e.key, e]));
  const hit = byKey.get(key);
  if (hit) return hit;
  const [category, id] = key.split('/');
  if (!id) return undefined;
  if (category === 'buildings' || category === 'wonders') return byKey.get(`${category === 'buildings' ? 'wonders' : 'buildings'}/${id}`);
  if (category === 'units') return byKey.get(`units/${unitPage(id)}`);
  return undefined;
}

/** Keys of the pages a unit, building or advance opens, for links from the rest of the UI. */
export const pediaKey = {
  unit: (type: string) => `units/${unitPage(type)}`,
  building: (id: string) => `${buildingCategory(id)}/${id}`,
  tech: (id: string) => `techs/${id}`,
  terrain: (id: string) => `terrains/${id}`,
  resource: (id: string) => `resources/${id}`,
  government: (id: string) => `governments/${id}`,
  civ: (id: string) => `civs/${id}`,
  concept: (id: string) => `concepts/${id}`,
};

/** Splits prose into text and links: "[Writing](pedia:techs/writing)". */
export function parseLinks(text: string): (string | PediaLinkRef)[] {
  const out: (string | PediaLinkRef)[] = [];
  const re = /\[([^\]]+)\]\(pedia:([a-zA-Z]+\/[a-zA-Z0-9]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ label: m[1]!, to: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
