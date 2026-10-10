/**
 * Turns a parsed rule file into the importer's JSON shape: named lists, explicit
 * indexes, decoded bit fields, and no redundant count fields or string padding.
 */
import type { Rec } from './codec.ts';
import { PAD_KEY } from './codec.ts';
import {
  BLDG_IMPROVEMENT,
  BLDG_OTHER,
  BLDG_SMALL_WONDER,
  BLDG_WONDER,
  bitNames,
  GAME_VICTORY,
  PRTO_ABILITIES,
  PRTO_AI_STRATEGY,
  PRTO_AIR_MISSIONS,
  PRTO_SPECIAL_ACTIONS,
  PRTO_STANDARD_ORDERS,
  PRTO_WORKER_ACTIONS,
  RACE_BUILD_PREFS,
  RACE_GOVERNOR,
  RACE_TRAITS,
  TECH_FLAGS,
} from './biq/flags.ts';
import { section, type BiqFile } from './biq/index.ts';

/** Output list name per BIQ section. */
export const SECTION_NAMES = {
  BLDG: 'buildings',
  CTZN: 'citizens',
  CULT: 'cultureOpinions',
  DIFF: 'difficulties',
  ERAS: 'eras',
  ESPN: 'espionageMissions',
  EXPR: 'experienceLevels',
  GOOD: 'resources',
  GOVT: 'governments',
  PRTO: 'units',
  RACE: 'civs',
  TECH: 'techs',
  TFRM: 'workerJobs',
  TERR: 'terrains',
  WSIZ: 'worldSizes',
} as const;

/** Count fields that only size a following list. */
const COUNT_FIELDS = new Set([
  'numSpaceshipParts',
  'numCultureLevels',
  'numGovernments',
  'numStealthTargets',
  'numCityNames',
  'numMilitaryLeaders',
  'numScientificLeaders',
  'numPossibleResources',
  'numPlayableCivs',
  'numRelations',
]);

function clean(rec: Rec, index: number): Rec {
  const out: Rec = { index };
  for (const [k, v] of Object.entries(rec)) {
    if (k === PAD_KEY || COUNT_FIELDS.has(k)) continue;
    out[k] = Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' ? v.map((x: Rec) => clean(x, 0)).map(({ index: _, ...x }) => x) : v;
  }
  return out;
}

const n = (r: Rec, k: string) => (typeof r[k] === 'number' ? r[k] : 0);

function decorate(tag: string, r: Rec): Rec {
  switch (tag) {
    case 'BLDG':
      r['traits'] = {
        improvement: bitNames(n(r, 'improvementFlags'), BLDG_IMPROVEMENT),
        other: bitNames(n(r, 'otherFlags'), BLDG_OTHER),
        smallWonder: bitNames(n(r, 'smallWonderFlags'), BLDG_SMALL_WONDER),
        wonder: bitNames(n(r, 'wonderFlags'), BLDG_WONDER),
      };
      break;
    case 'PRTO':
      r['traits'] = {
        abilities: bitNames(n(r, 'abilities'), PRTO_ABILITIES),
        aiStrategy: bitNames(n(r, 'aiStrategy'), PRTO_AI_STRATEGY),
        standardOrders: bitNames(n(r, 'standardOrders'), PRTO_STANDARD_ORDERS),
        specialActions: bitNames(n(r, 'specialActions'), PRTO_SPECIAL_ACTIONS),
        workerActions: bitNames(n(r, 'workerActions'), PRTO_WORKER_ACTIONS),
        airMissions: bitNames(n(r, 'airMissions'), PRTO_AIR_MISSIONS),
      };
      break;
    case 'RACE':
      r['traits'] = {
        civ: bitNames(n(r, 'bonuses'), RACE_TRAITS),
        governor: bitNames(n(r, 'governorSettings'), RACE_GOVERNOR),
        buildNever: bitNames(n(r, 'buildNever'), RACE_BUILD_PREFS),
        buildOften: bitNames(n(r, 'buildOften'), RACE_BUILD_PREFS),
      };
      break;
    case 'TECH':
      r['traits'] = bitNames(n(r, 'flags'), TECH_FLAGS);
      break;
    case 'TERR': {
      const mask = (r['possibleResourcesMask'] as number[] | undefined) ?? [];
      const list: number[] = [];
      mask.forEach((byte, i) => {
        for (let bit = 0; bit < 8; bit++) if ((byte >> bit) & 1) list.push(i * 8 + bit);
      });
      // Replace the mask with the list, keeping it near the top for readability.
      const { index, possibleResourcesMask: _, ...rest } = r;
      return { index, possibleResources: list, ...rest };
    }
    case 'GAME':
      r['traits'] = bitNames(n(r, 'victoryFlags'), GAME_VICTORY);
      delete r['searchFolders'];
      break;
  }
  return r;
}

export function toImportedRules(biq: BiqFile, file: string): Rec {
  const out: Rec = {
    source: {
      file,
      edition: biq.edition,
      version: `${String(biq.header['majorVersion'])}.${String(biq.header['minorVersion'])}`,
      title: biq.header['title'],
    },
  };
  for (const [tag, name] of Object.entries(SECTION_NAMES)) {
    out[name] = section(biq, tag).map((r, i) => decorate(tag, clean(r, i)));
  }
  out['generalRules'] = clean(section(biq, 'RULE')[0] ?? {}, 0);
  const flav = section(biq, 'FLAV')[0];
  const groups = (flav?.['groups'] as Rec[] | undefined) ?? [];
  out['flavors'] = ((groups[0]?.['flavors'] as Rec[] | undefined) ?? []).map((f, i) => clean(f, i));
  out['game'] = decorate('GAME', clean(section(biq, 'GAME')[0] ?? {}, 0));
  return out;
}
