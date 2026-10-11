/**
 * `pnpm --filter @civolution/assets manifest:phase3` writes manifests/phase3.json: the 2D
 * art Phase 3's screens use: portraits for the scout, great leader and army, experience
 * badges, war and peace emblems, and headline illustrations for the big moments of war.
 * Subjects are written here in our own words.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const phase2 = JSON.parse(readFileSync(resolve(here, '../manifests/phase2.json'), 'utf8')) as {
  modelPreference: string[];
  styleBible: unknown;
  styleSuffix: string;
};

const UNITS: Record<string, string> = {
  scout: 'lightly equipped scout in a hooded travelling cloak with a walking staff and a horn at the belt',
  leader: 'great general in a plumed helmet and flowing cape, raising a sword beside a tall banner',
  army: 'tight formation of three soldiers, a swordsman, a spearman and an archer, gathered round a tall standard',
};

const EXPERIENCE: Record<string, string> = {
  conscript: 'a single plain bronze chevron',
  regular: 'two polished bronze chevrons',
  veteran: 'three silver chevrons with a small laurel sprig',
  elite: 'three golden chevrons under a golden star, framed by a laurel wreath',
};

const EMBLEMS: Record<string, string> = {
  war: 'two crossed swords over a red shield',
  peace: 'a white dove carrying an olive branch over a blue shield',
  barbarians: 'a crude horned helmet over two crossed axes on a dark red hide',
};

const NEWS: Record<string, string> = {
  warDeclared: 'a war council at dusk: a commander pointing at a map table while banners are raised and horns are blown outside the tent',
  peaceMade: 'two envoys clasping hands in a sunlit courtyard while soldiers lower their spears and a dove flies overhead',
  cityCaptured: 'victorious soldiers marching through the open gate of a conquered walled city, their banners raised on the towers',
  cityLost: 'a walled city at dusk with foreign banners rising over its towers while its defenders retreat across the fields',
  cityDestroyed: 'the smoking ruins of a razed city, broken walls and charred beams under a grey sky',
  cityRaided: 'barbarian horsemen galloping away from a burning town gate with sacks of loot',
  nuclearStrike: 'a distant mushroom cloud rising over a city skyline seen from far-off hills at dawn',
  leaderBorn: 'a battle-scarred general raised on the shields of cheering soldiers on a misty battlefield',
  playerEliminated: 'a fallen royal banner lying torn in the mud of a deserted battlefield at sunset',
};

type Item = { id: string; prompt: string; aspectRatio: string; out: string; post: { resize: number; circleMask?: boolean; roundedMask?: number }; references: string[] };
const items: Item[] = [];
const ref = ['styleBible'];

for (const [id, subject] of Object.entries(UNITS)) {
  items.push({
    id: `unit-${id}`,
    prompt: `Game portrait of a unit: a ${subject}, shown whole and in profile, centered on a round medallion with a soft sky-and-earth background and a thin bronze rim, the bronze rim touching all four edges of the image so the medallion fills the whole square. No text. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/units/${id}.png`,
    post: { resize: 160, circleMask: true },
    references: ref,
  });
}
for (const [id, subject] of Object.entries(EXPERIENCE)) {
  items.push({
    id: `experience-${id}`,
    prompt: `Small military rank badge: ${subject}, centered on a round dark navy enamel medallion with a thin bronze rim, the rim touching all four edges of the image so the medallion fills the whole square. Simple, bold, readable at very small size. No text, no numbers. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/experience/${id}.png`,
    post: { resize: 64, circleMask: true },
    references: ref,
  });
}
for (const [id, subject] of Object.entries(EMBLEMS)) {
  items.push({
    id: `emblem-${id}`,
    prompt: `Heraldic emblem: ${subject}, centered on a round medallion with a thin bronze rim, the rim touching all four edges of the image so the medallion fills the whole square. Bold and readable at small size. No text. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/war/${id}.png`,
    post: { resize: 96, circleMask: true },
    references: ref,
  });
}
for (const [id, subject] of Object.entries(NEWS)) {
  items.push({
    id: `news-${id}`,
    prompt: `Painted illustration for a headline in a strategy game: ${subject}. Wide cinematic composition, dramatic but not gory, no close-up faces. No text, no letters, no lettering on banners. Landscape image.`,
    aspectRatio: '16:9',
    out: `packages/client/public/art/news/${id}.jpg`,
    post: { resize: 640 },
    references: ref,
  });
}

const manifest = {
  $comment:
    'Phase 3 art, written by scripts/phase3-manifest.ts. Generate with: OPEN_ROUTER_KEY=... pnpm --filter @civolution/assets gen -- --manifest manifests/phase3.json. Reuses the Phase 1 style bible as the reference image.',
  modelPreference: phase2.modelPreference,
  styleBible: phase2.styleBible,
  styleSuffix: phase2.styleSuffix,
  items,
};
writeFileSync(resolve(here, '../manifests/phase3.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote manifests/phase3.json with ${items.length} items.`);
