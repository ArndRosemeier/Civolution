/**
 * `pnpm --filter @civolution/assets manifest:phase6` writes manifests/phase6.json and
 * manifests/phase6-sounds.json: the art and sound Phase 6's rules need. Icons for the
 * eight civilization traits and the ten spaceship parts, headline illustrations for golden
 * ages, great scientists, culture flips, the space race, the climate and the United
 * Nations, one picture per way of winning plus defeat, and the sound effects for those
 * moments. Subjects are written here in our own words.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const phase2 = JSON.parse(readFileSync(resolve(here, '../manifests/phase2.json'), 'utf8')) as {
  modelPreference: string[];
  styleBible: unknown;
  styleSuffix: string;
};

/** Civilization traits (art/traits/<trait>.png). */
const TRAITS: Record<string, string> = {
  militaristic: 'a bronze helmet with a red crest above two crossed short swords',
  religious: 'a small stone temple with a glowing flame on its altar',
  commercial: 'a pair of brass merchant scales with a gold coin on one pan',
  industrious: 'a hammer and a pickaxe crossed over a stack of cut stone blocks',
  expansionist: 'a covered wagon wheel beside a planted flag on a green hill',
  scientific: 'a brass telescope on a tripod beside a glowing star',
  agricultural: 'a golden wheat sheaf tied with a ribbon beside a wooden plough',
  seafaring: 'a ship steering wheel with a coiled rope and a small anchor',
};

/** Spaceship parts (art/buildings/<id>.png, the building tile style of Phase 2). */
const PARTS: Record<string, string> = {
  ssThrusters: 'a cluster of four small rocket thrusters with blue exhaust glow, mounted on a white frame',
  ssEngine: 'a large bell-shaped rocket engine nozzle with pipes and a glowing blue core',
  ssDockingBay: 'a round docking ring with a hatch and guide lights on a spacecraft hull',
  ssCockpit: 'a spacecraft cockpit pod with wide curved windows and a single pilot seat inside',
  ssFuelCells: 'a row of cylindrical fuel cell tanks connected by glowing tubes',
  ssLifeSupportSystem: 'a sealed greenhouse module with small green plants under a glass dome and air tanks',
  ssStasisChamber: 'a row of upright glass sleep pods with soft blue frost inside',
  ssStorageSupply: 'a cargo module with stacked supply crates held by straps in a white frame',
  ssPlanetaryPartyLounge: 'a round spacecraft lounge module with warm lights, a small round table and a view of stars',
  ssExteriorCasing: 'curved white hull plates with rivets and a heat shield panel, assembled into a sleek casing',
};

/** Headline illustrations (art/news/<kind>.jpg), one per news kind the client shows. */
const NEWS: Record<string, string> = {
  goldenAge: 'a prosperous ancient city at golden sunset, festival banners without emblems, crowds in a busy market, new temples and workshops rising, warm glowing light over everything',
  scientistBorn: 'a scholar in a long robe standing in a candle-lit study full of instruments, globes, star charts and open books, looking up at a model of the planets',
  cultureFlip: 'townspeople opening the gates of their walled city to welcome a procession of musicians and artists from a neighbouring land, while the old garrison marches away',
  spaceshipLaunched: 'a large white spaceship lifting off from a launch tower on a column of fire and smoke at dawn, crowds watching from far away',
  spaceshipLost: 'a half-assembled spaceship toppled on its launch pad, smoke drifting over the scaffolding, a captured capital city in the distance',
  globalWarming: 'a cracked dry riverbed with dying trees under a hazy orange sky, smokestacks of distant factories on the horizon',
  meltdown: 'a nuclear power plant with a cracked cooling tower releasing a sickly green glow and dark smoke over an evacuated town at dusk',
  unitedNations: 'a great round assembly hall with delegates seated in a ring of desks, a raised speaker\'s podium under a domed skylight, flags without emblems along the walls',
};

/** One picture per way of winning, and defeat (art/victory/<kind>.jpg). */
const VICTORY: Record<string, string> = {
  conquest: 'a victorious army raising its banners on the walls of the last enemy capital at sunrise, smoke clearing over a vast conquered land',
  domination: 'a towering imperial capital at the heart of a vast continent, roads and railways reaching out to countless cities under one ruler, seen from a high balcony',
  space: 'a spaceship with glowing engines arriving at a blue and green planet orbiting twin suns, stars all around',
  cultural: 'a radiant city of grand theatres, libraries and museums at dusk, crowds from many lands streaming in to see its festivals and art',
  diplomatic: 'a leader standing at the podium of a great world assembly as delegates of every nation rise to applaud',
  score: 'a stately hall with a long tapestry woven with scenes of a civilization\'s whole history, from huts and pyramids to skyscrapers and rockets',
  regicide: 'a fallen enemy king\'s crown lying on the steps of an empty throne while victorious soldiers lower their spears',
  victoryPoints: 'a triumphal arch hung with laurel wreaths, trophies and wonders depicted in its carved reliefs, a parade passing beneath',
  defeat: 'the ruins of a once-great city under a grey sky, broken columns and a fallen statue overgrown with weeds, a lone traveller looking on',
};

type Item = { id: string; prompt: string; aspectRatio: string; out: string; post: { resize: number; circleMask?: boolean; roundedMask?: number }; references: string[] };
const items: Item[] = [];
const ref = ['styleBible'];
const noText = 'Absolutely no text: no letters, no numbers, no writing anywhere, including on banners, books, signs and screens.';

for (const [id, subject] of Object.entries(TRAITS)) {
  items.push({
    id: `trait-${id}`,
    prompt: `Small round game icon: ${subject}, centered on a round deep crimson enamel medallion with a smooth unbroken bronze rim, the rim touching all four edges of the image so the medallion fills the whole square. Bold, simple shapes, readable at very small size. ${noText} Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/traits/${id}.png`,
    post: { resize: 96, circleMask: true },
    references: ref,
  });
}
for (const [id, subject] of Object.entries(PARTS)) {
  items.push({
    id: `building-${id}`,
    prompt: `Game icon of a spaceship part: ${subject}. Seen at a slight three-quarter angle, filling a rounded-square tile with a soft slate blue gradient background and a thin bronze border, the tile filling the entire image with its border touching all four edges. ${noText} Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/buildings/${id}.png`,
    post: { resize: 192, roundedMask: 0.14 },
    references: ref,
  });
}
for (const [id, subject] of Object.entries(NEWS)) {
  items.push({
    id: `news-${id}`,
    prompt: `Painted illustration for a headline in a strategy game: ${subject}. Wide cinematic composition, dramatic but not gory, no close-up faces. ${noText} Landscape image.`,
    aspectRatio: '16:9',
    out: `packages/client/public/art/news/${id}.jpg`,
    post: { resize: 640 },
    references: ref,
  });
}
for (const [id, subject] of Object.entries(VICTORY)) {
  items.push({
    id: `victory-${id}`,
    prompt: `Painted illustration for the end of a strategy game: ${subject}. Wide cinematic composition, epic and hopeful${id === 'defeat' ? ', quiet and melancholy' : ''}, no close-up faces. ${noText} Landscape image.`,
    aspectRatio: '16:9',
    out: `packages/client/public/art/victory/${id}.jpg`,
    post: { resize: 960 },
    references: ref,
  });
}

writeFileSync(
  resolve(here, '../manifests/phase6.json'),
  `${JSON.stringify(
    {
      $comment:
        'Phase 6 art, written by scripts/phase6-manifest.ts. Generate with: OPEN_ROUTER_KEY=... pnpm --filter @civolution/assets gen -- --manifest manifests/phase6.json. Reuses the Phase 1 style bible as the reference image.',
      modelPreference: phase2.modelPreference,
      styleBible: phase2.styleBible,
      styleSuffix: phase2.styleSuffix,
      items,
    },
    null,
    2,
  )}\n`,
);

/** Sound effects (public/audio/<id>-<n>.mp3); every prompt starts with "The sound of". */
const SOUNDS: [string, string][] = [
  ['golden-age', 'The sound of a bright brass fanfare rising over a festive crowd cheering and bells ringing, triumphant and warm, without voices singing words, about three seconds'],
  ['culture-flip', 'The sound of a city gate creaking open while a distant crowd cheers and a drum beats a slow welcome, without voices speaking words, about two and a half seconds'],
  ['spaceship-launch', 'The sound of a huge rocket engine igniting with a deep rumbling roar that builds and fades into the sky, without voices, about four seconds'],
  ['global-warming', 'The sound of a hot dry wind sweeping over cracked earth with a low ominous drone underneath, without voices, about three seconds'],
  ['un-vote', 'The sound of a wooden gavel striking twice in a large echoing hall, followed by polite applause from a crowd, without voices speaking words, about two and a half seconds'],
  ['pollution', 'The sound of a factory steam whistle followed by a low hiss of smoke from chimneys, without voices, about two seconds'],
  ['resistance', 'The sound of an angry crowd murmuring and stamping in a stone square, with a few shouts that are not words, about two seconds'],
  ['meltdown', 'The sound of a deep electrical hum rising into a warning siren and a heavy muffled boom, without voices, about three seconds'],
  ['victory', 'The sound of a grand orchestral fanfare with trumpets and timpani building to a triumphant final chord, without voices, about five seconds'],
  ['defeat', 'The sound of a slow mournful horn over a low drum roll fading into silence, without voices, about four seconds'],
];
writeFileSync(
  resolve(here, '../manifests/phase6-sounds.json'),
  `${JSON.stringify(
    {
      $comment:
        "Phase 6 sound effects (ByteDance Seed Audio on OpenRouter). Run: OPEN_ROUTER_KEY=... pnpm --filter @civolution/assets sounds -- --manifest manifests/phase6-sounds.json. Every prompt starts with 'The sound of' (the tool adds it when missing).",
      model: 'bytedance-seed/seed-audio-1-0',
      outDir: 'packages/client/public/audio',
      items: SOUNDS.map(([id, prompt]) => ({ id, prompt, variations: 2 })),
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote manifests/phase6.json with ${items.length} items and manifests/phase6-sounds.json with ${SOUNDS.length} sounds.`);
