/**
 * `pnpm --filter @civolution/assets manifest:phase8` writes manifests/phase8.json and
 * manifests/phase8-sounds.json: what Phase 8 (polish) needs. Portraits of the six advisors
 * who give the tutorial hints, worker-job icons, a picture per Civilopedia topic and era,
 * the Civilopedia's cover, a few interface sounds and the two modern-era music variations
 * Seed Audio rejected in Phase 7 (new wording). Subjects are written here in our own words.
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

const noText =
  'Absolutely no text: no letters, words, numbers, runes, labels, captions, banners with writing, book titles, map labels, signatures or watermarks anywhere in the image. Any book, scroll, map or sign shows only blank pages or abstract marks.';

/** The six advisors (art/advisors/<id>.jpg), who speak the tutorial hints. */
const ADVISORS: Record<string, string> = {
  domestic: 'a calm, practical woman in her forties, the steward of the realm, in a dark green coat with a brass chain of office, holding a ledger closed against her chest, a granary and rooftops softly blurred behind her',
  trade: 'a cheerful merchant in his fifties with a trimmed grey beard, in a rich ochre robe with a coin purse at his belt, a busy harbour with sailing ships softly blurred behind him',
  military: 'a weathered general in her fifties with short grey hair and a scar over one eyebrow, in a navy uniform coat with simple bronze buttons, a fortress wall and banners without emblems softly blurred behind her',
  foreign: 'a poised diplomat in his thirties with a neat moustache, in a deep terracotta coat with a silver brooch, holding a sealed letter, a grand hall with tall windows softly blurred behind him',
  science: 'an eager young scholar in her twenties with round spectacles and ink-stained fingers, in a sea-turquoise robe, a brass astrolabe and a shelf of blank-spined books softly blurred behind her',
  culture: 'a warm, thoughtful artist in his sixties with a white beard and a paint-flecked smock over a burgundy shirt, a theatre stage and marble statues softly blurred behind him',
};

/** Worker-job medallions (art/jobs/<id>.png). */
const JOBS: Record<string, string> = {
  mine: 'a mine entrance with timber supports cut into a rocky hillside, a pickaxe and a cart of ore beside it',
  irrigation: 'a straight irrigation channel of clear water running between rows of green crops',
  fortress: 'a squat square stone fortress with four corner towers on a grassy rise',
  road: 'a dirt road winding across green fields, wagon ruts in it',
  railroad: 'a railway track with wooden sleepers curving across a plain, steam in the distance',
  plantForest: 'a worker kneeling to plant a young tree sapling, with rows of saplings behind',
  clearForest: 'felled tree trunks stacked beside fresh stumps and an axe in a log',
  clearWetlands: 'a marsh being drained by a ditch, reeds giving way to dry ground',
  clearDamage: 'workers shovelling away dark soot and debris from a field, the earth clean behind them',
  airfield: 'a small airstrip with a windsock and a propeller plane parked beside a hangar',
  radarTower: 'a tall lattice radar tower with a rotating dish on a hilltop',
  outpost: 'a wooden watchtower on stilts with a ladder, overlooking a valley',
  barricade: 'a low wall of sandbags and timber stakes across a field',
};

/** Civilopedia topic pictures (art/pedia/<concept>.jpg). */
const CONCEPTS: Record<string, string> = {
  cities: 'a young town on a river bend growing outward, new houses being raised at its edge, fields around it',
  tiles: 'a patchwork landscape seen from a hill: farmed grassland, a forest, rolling hills with a mine, a river and the sea, a small town in the middle',
  production: 'a busy workshop yard where carpenters and smiths build a wooden siege engine, sparks and sawdust in the air',
  trade: 'a caravan of camels and carts arriving at a city gate on a paved road, a harbour with ships beyond',
  science: 'a scholar\'s study at night, a telescope at an open window, brass instruments and blank parchment on a desk lit by a lamp',
  corruption: 'a shady official in a back room quietly sliding gold coins off a counting table into his sleeve, a clerk looking away',
  happiness: 'townspeople dancing in a sunny square with garlands, musicians playing, a fountain in the middle',
  governments: 'a grand council chamber with an empty throne at one end and benches of delegates in a half circle',
  culture: 'an amphitheatre on a hillside at sunset with a play on stage, a marble temple and statues nearby',
  cultureFlips: 'citizens of a walled town lowering one plain banner and raising another of a different colour, onlookers cheering',
  movement: 'a column of soldiers and wagons crossing a river ford, a road leading on into hills',
  workers: 'workers in simple clothes digging an irrigation ditch and laying a road beside green fields',
  combat: 'two lines of ancient soldiers clashing with spears and shields on a dusty plain, dramatic but not gory',
  bombard: 'catapults on a ridge hurling stones toward a distant city wall, dust rising where they land',
  experience: 'a grizzled veteran soldier showing young recruits how to hold their spears on a training ground',
  leaders: 'a heroic commander on a white horse on a hilltop, raising a sword as troops rally below',
  armies: 'three regiments marching together under one large plain standard, a commander at their head',
  naval: 'two wooden warships exchanging cannon fire on a rolling sea, smoke drifting across the water',
  air: 'propeller fighter planes flying in formation over clouds above a coastline',
  nukes: 'a distant mushroom cloud on the horizon seen from a quiet hill at dusk, an empty field in front',
  barbarians: 'fur-clad raiders on horseback galloping out of a misty forest toward a farm',
  capture: 'soldiers marching through the open gate of a conquered city, its defenders laying down weapons',
  warWeariness: 'a weary crowd of citizens in a grey street holding plain blank placards, a column of tired soldiers passing',
  diplomacy: 'two rulers shaking hands across a long table with an unrolled blank treaty between them, advisors standing behind',
  espionage: 'a cloaked spy climbing over a palace balcony at night under a crescent moon',
  goldenAges: 'a shining city at golden sunset with scaffolding on new domes, crowds and banners in the streets',
  pollution: 'smoking factory chimneys over a grey river, dead trees on the bank',
  spaceship: 'a tall rocket on a launch pad at dawn, steam billowing, gantry towers around it',
  victory: 'a triumphant procession entering a great capital under an arch, crowds throwing petals',
  automation: 'an orderly city seen from above with workers, carts and soldiers each going about their tasks along neat roads, like clockwork',
  difficulty: 'a lone traveller at the foot of a steep mountain path, the peak far above in clouds',
};

/** Era pictures (art/eras/<id>.jpg). */
const ERAS: Record<string, string> = {
  ancient: 'an ancient river valley city with ziggurat-like stepped temples, palm trees and reed boats on the river',
  middle: 'a medieval walled town with a castle and a cathedral on a hill, farmland and a windmill around it',
  industrial: 'an industrial city with brick factories, a railway bridge and a steam train crossing a river',
  modern: 'a modern city skyline of glass towers by the sea at dusk, highways and an airport beyond',
};

const ref = ['styleBible'];
const items: object[] = [];
for (const [id, subject] of Object.entries(ADVISORS)) {
  items.push({
    id: `advisor-${id}`,
    prompt: `Painted head-and-shoulders portrait for a strategy game's advisor panel: ${subject}. Facing the viewer with a friendly, attentive expression, softly lit from the upper left, the face in the upper middle of the image with space around it. Hand-painted, stylised, not a caricature, not a real or famous person. ${noText} No frame. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/advisors/${id}.jpg`,
    post: { resize: 320 },
    references: ref,
  });
}
for (const [id, subject] of Object.entries(JOBS)) {
  items.push({
    id: `job-${id}`,
    prompt: `Game icon of a worker job: ${subject}, centered on a round medallion with a soft sky-and-earth background and an unbroken, even, thin bronze rim, the bronze rim touching all four edges of the image so the medallion fills the whole square. ${noText} Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/jobs/${id}.png`,
    post: { resize: 128, circleMask: true },
    references: ref,
  });
}
for (const [id, subject] of Object.entries(CONCEPTS)) {
  items.push({
    id: `pedia-${id}`,
    prompt: `Painted illustration for an encyclopedia page in a strategy game: ${subject}. Wide cinematic composition, warm and readable, not gory, no close-up faces. ${noText} Landscape image.`,
    aspectRatio: '16:9',
    out: `packages/client/public/art/pedia/${id}.jpg`,
    post: { resize: 640 },
    references: ref,
  });
}
for (const [id, subject] of Object.entries(ERAS)) {
  items.push({
    id: `era-${id}`,
    prompt: `Painted panorama for an era in a strategy game about history: ${subject}. Wide cinematic composition, golden light, no people in close-up. ${noText} Landscape image.`,
    aspectRatio: '16:9',
    out: `packages/client/public/art/eras/${id}.jpg`,
    post: { resize: 800 },
    references: ref,
  });
}
items.push({
  id: 'pedia-cover',
  prompt: `Painted illustration for the cover of an in-game encyclopedia: a grand old library hall with tall shelves of leather books with blank spines, a globe, a brass orrery and an open book on a lectern with blank pages, warm light through high windows. Wide cinematic composition. ${noText} Landscape image.`,
  aspectRatio: '16:9',
  out: 'packages/client/public/art/pedia/cover.jpg',
  post: { resize: 800 },
  references: ref,
});

writeFileSync(
  resolve(here, '../manifests/phase8.json'),
  `${JSON.stringify(
    {
      $comment:
        'Phase 8 art, written by scripts/phase8-manifest.ts. Generate with: OPEN_ROUTER_KEY=... pnpm --filter @civolution/assets gen -- --manifest manifests/phase8.json. Reuses the Phase 1 style bible as the reference image.',
      modelPreference: phase2.modelPreference,
      styleBible: phase2.styleBible,
      styleSuffix: phase2.styleSuffix,
      items,
    },
    null,
    2,
  )}\n`,
);

const sounds = [
  { id: 'hint', prompt: 'The sound of a soft, friendly two-note wooden chime, like a gentle nudge for attention, without voices, under one second', variations: 2 },
  { id: 'pedia-open', prompt: 'The sound of a heavy leather-bound book being opened on a wooden desk, pages fluttering briefly, without voices, about one second', variations: 2 },
  { id: 'page-turn', prompt: 'The sound of a single crisp paper page being turned in a large book, without voices, under one second', variations: 3 },
  // Phase 7 got one modern-era bed; Seed Audio's moderation turned the other two away. New wording, variations 2 and 3 only.
  { id: 'music-modern', from: 2, prompt: 'The sound of a slow, peaceful instrumental piece: soft electric piano chords, a warm synthesizer pad and a light pulse of brushed drums, spacious and reflective, no singing, about thirty seconds', variations: 3 },
];
writeFileSync(
  resolve(here, '../manifests/phase8-sounds.json'),
  `${JSON.stringify(
    {
      $comment:
        "Phase 8 interface sounds and the missing modern-era music (ByteDance Seed Audio on OpenRouter). Run: OPEN_ROUTER_KEY=... pnpm --filter @civolution/assets sounds -- --manifest manifests/phase8-sounds.json. Every prompt starts with 'The sound of' (the tool adds it when missing).",
      model: 'bytedance-seed/seed-audio-1-0',
      outDir: 'packages/client/public/audio',
      items: sounds,
    },
    null,
    2,
  )}\n`,
);
console.log(`phase8.json: ${items.length} items; phase8-sounds.json: ${sounds.length} items`);
