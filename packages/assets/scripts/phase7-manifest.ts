/**
 * `pnpm --filter @civolution/assets manifest:phase7` writes manifests/phase7.json and
 * manifests/phase7-sounds.json: what Phase 7 (art and audio) still needed after the
 * earlier phases. Portraits for the unique units and the few other units without one
 * (kings use their civilization's leader portrait, and the numbered rule-file copies of a
 * unit use the original's), a barbarian chieftain for the diplomacy and victory screens,
 * seamless ground textures for the 3D terrain, the remaining event sounds, a move sound
 * per unit class, era music and ambiences. Subjects are written here in our own words.
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
  'Absolutely no text: no letters, words, numbers, runes, labels, banners with writing, signatures or watermarks anywhere in the image.';

/** Unit portraits (art/units/<id>.png), same frame as the Phase 2 and 3 portraits. */
const UNITS: Record<string, string> = {
  jaguarWarrior: 'an Aztec jaguar warrior in a spotted jaguar-skin suit with the jaws framing his face, holding a wooden club edged with obsidian and a round feathered shield',
  bowman: 'a Babylonian bowman in a long fringed tunic and conical cap, drawing a composite bow',
  hoplite: 'a Greek hoplite in a crested bronze helmet and bronze breastplate, with a large round bronze shield and a long spear',
  impi: 'a Zulu impi warrior with a tall oxhide shield in black and white patches and a short stabbing spear, wearing a feathered headband and cow-tail armlets, running forward',
  legionary: 'a Roman legionary in segmented iron armour and a red tunic, with a tall curved red rectangular shield and a short sword',
  immortals: 'a Persian immortal in an embroidered robe and soft cloth cap, with a wicker shield, a spear and a quiver of arrows',
  warChariot: 'an Egyptian two-wheeled war chariot drawn by two horses, an archer standing in it beside the driver',
  rider: 'a Chinese armoured horseman in lamellar armour with a lance, on a sturdy horse with a red saddle cloth',
  mountedWarrior: 'an Iroquois mounted warrior with a feather in his hair and a bow, riding a spotted horse bareback',
  musketeer: 'a French musketeer in a blue tabard with a white cross, a wide feathered hat and a long musket, a rapier at his side',
  samurai: 'a Japanese samurai in lacquered plate armour and a horned helmet, holding a long curved sword with both hands',
  warElephant: 'an Indian war elephant with a decorated howdah carrying a spearman, its tusks capped with metal',
  cossack: 'a Russian cossack in a tall fur hat and long coat with cartridge loops, riding a fast horse with a curved sabre raised',
  panzer: 'a German mid-twentieth-century battle tank in dark grey with a long gun barrel and wide tracks',
  manOWar: 'an English three-masted man-of-war with two gun decks, white sails and open gun ports, under way on a choppy sea',
  f15: 'an American twin-engine jet fighter with twin tail fins in light grey, banking in a clear sky',
  keshik: 'a Mongol horse archer in a fur-trimmed helmet and padded coat, turning in the saddle to shoot a bow',
  conquistador: 'a Spanish conquistador in a crested steel helmet and breastplate, riding a horse with a lance',
  berserk: 'a Viking berserker in a bearskin with a round painted wooden shield and a broad axe, charging',
  sipahi: 'an Ottoman sipahi cavalryman in a pointed helmet and mail, with a lance carrying a small pennant and a round shield, on a galloping horse',
  gallicSwordsman: 'a Gallic swordsman with long braided hair and a moustache, a tall oval shield and a long iron sword, wearing checked trousers',
  ansarWarrior: 'an Arab ansar warrior on a camel, in flowing robes and a turban, with a curved sword',
  numidianMercenary: 'a Numidian mercenary with a round leather shield and a bundle of javelins, in a light tunic',
  hwacha: "a Korean hwach'a, a wooden two-wheeled cart holding a rack of many fire arrows, with two gunners beside it",
  enkiduWarrior: 'a Sumerian warrior with a rectangular shield and a long spear, in a sheepskin kilt and a leather cap',
  threeManChariot: 'a Hittite heavy chariot drawn by two horses carrying three men: a driver, a spearman and a shield bearer',
  carrack: 'a Portuguese carrack with a high stern castle, round hull and square sails with red crosses',
  swissMercenary: 'a Swiss mercenary pikeman in a slashed doublet in bright colours and a plumed hat, with a long pike and a halberd',
  chasquiScout: 'an Inca chasqui runner in a woven tunic with a conch-shell horn and a knotted cord at the belt, running along a mountain path',
  javelinThrower: 'a Maya javelin thrower with a jade-decorated headdress, poised to cast a javelin with a spear-thrower',
  dromon: 'a Byzantine dromon, a long oared war galley with a lateen sail and a bronze siphon at the bow',
  crusader: 'a crusader knight on foot in mail and a white surcoat with a red cross, holding a kite shield and a sword',
  ancientCavalry: 'an ancient Greek cavalryman in a bronze helmet and short cloak, riding with a spear',
  princess: 'a young princess in a flowing embroidered gown and a slim gold circlet, standing calmly under a small canopy',
};

/** Seamless ground textures for the terrain shader (art/terrain/<id>.jpg). */
const TERRAIN: Record<string, string> = {
  grassland: 'lush green meadow grass with small clover and a few tiny wildflowers',
  plains: 'dry golden-green steppe grass with patches of bare earth',
  desert: 'rippled pale sand dunes with a few small pebbles',
  tundra: 'cold tundra ground: grey-green moss and lichen, low shrubs and small stones',
  floodPlain: 'dark fertile river silt with short green shoots and small puddles',
  hills: 'grassy rolling ground with scattered rocks and patches of brown earth',
  mountains: 'rugged grey granite rock with cracks and small ledges',
  forest: 'forest floor: fallen leaves, pine needles, moss and small twigs',
  jungle: 'tropical jungle floor: broad dark green leaves, ferns and wet soil',
  marsh: 'marshy wetland: reeds, muddy water and green algae',
  volcano: 'black volcanic ash and dark basalt rock with faint red cracks',
  beach: 'fine warm beach sand with a few tiny shells',
  snow: 'wind-packed white snow with faint blue shadows',
};

const ref = ['styleBible'];
const items: object[] = [];
for (const [id, subject] of Object.entries(UNITS)) {
  items.push({
    id: `unit-${id}`,
    prompt: `Game portrait of a unit: ${subject}, shown whole and in profile, centered on a round medallion with a soft sky-and-earth background and an unbroken, even, thin bronze rim, the bronze rim touching all four edges of the image so the medallion fills the whole square. ${noText} Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/units/${id}.png`,
    post: { resize: 160, circleMask: true },
    references: ref,
  });
}
items.push({
  id: 'leader-barbarians',
  prompt: `Painted head-and-shoulders portrait for a strategy game's diplomacy screen: a fierce barbarian warlord in his forties with a braided beard, a fur mantle over a mail shirt and an iron helmet with horns of bone, before a smoky camp fire and rough tents at dusk. Facing the viewer, scowling, softly lit from the upper left, the face in the middle of the image with space around it. Hand-painted, stylised, not a caricature. ${noText} No frame. Square image.`,
  aspectRatio: '1:1',
  out: 'packages/client/public/art/leaders/barbarians.jpg',
  post: { resize: 320 },
  references: ref,
});
for (const [id, subject] of Object.entries(TERRAIN)) {
  items.push({
    id: `terrain-${id}`,
    prompt: `Seamless tileable ground texture seen straight from above, flat even lighting with no shadows cast across the image and no perspective: ${subject}. Evenly spread detail over the whole square with no single focal point, no horizon, no objects standing out, no border or frame. Painted in the game's stylised hand-painted look. ${noText} Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/terrain/${id}.jpg`,
    post: { resize: 512, seamless: true },
    references: ref,
  });
}

writeFileSync(
  resolve(here, '../manifests/phase7.json'),
  `${JSON.stringify(
    {
      $comment:
        'Phase 7 art, written by scripts/phase7-manifest.ts. Generate with: OPEN_ROUTER_KEY=... pnpm --filter @civolution/assets gen -- --manifest manifests/phase7.json. Reuses the Phase 1 style bible as the reference image.',
      modelPreference: phase2.modelPreference,
      styleBible: phase2.styleBible,
      styleSuffix: phase2.styleSuffix,
      items,
    },
    null,
    2,
  )}\n`,
);

/** Sound effects, music and ambiences (public/audio/<id>-<n>.mp3); every prompt starts with "The sound of". */
const SOUNDS: [string, string, number][] = [
  // Moving, by unit class.
  ['move-foot', 'The sound of a small group of soldiers marching a few steps on a dirt road, boots and light gear rattling, without voices, about one second', 3],
  ['move-mounted', 'The sound of horses trotting a few strides on hard ground with harness jingling, without voices, about one second', 3],
  ['move-wheeled', 'The sound of a heavy vehicle rolling forward a short way, engine rumbling and tracks or wheels crunching gravel, without voices, about one and a half seconds', 3],
  ['move-ship', 'The sound of a ship cutting through waves, water rushing along the hull and wood creaking, without voices, about one and a half seconds', 3],
  ['move-air', 'The sound of an aircraft passing overhead with a rising and falling engine whoosh, without voices, about one and a half seconds', 3],
  // Units.
  ['unit-lost', 'The sound of a soldier falling: armour and weapons clattering to the ground followed by a short low drum beat, without voices, about one and a half seconds', 3],
  ['unit-upgraded', 'The sound of a blacksmith hammer striking an anvil twice followed by a short bright brass flourish, without voices, about two seconds', 2],
  ['unload', 'The sound of a wooden gangplank dropping onto a pier with a thud and boots stepping off into shallow water, without voices, about one and a half seconds', 2],
  ['join-army', 'The sound of a marching drum roll with a banner snapping in the wind and soldiers falling into step, without voices, about two seconds', 2],
  ['disband', 'The sound of soldiers laying down their weapons and walking away, footsteps fading, without voices, about one and a half seconds', 2],
  ['unit-woke', 'The sound of a short sharp warning horn call from a sentry post, without voices, about one second', 2],
  ['arrived', 'The sound of a soft leather drum tap and a light jingle as a unit halts, without voices, under one second', 2],
  ['order', 'The sound of a wooden shield set down firmly with a muffled thump, without voices, under one second', 2],
  ['zoc-strike', 'The sound of a quick clash of two swords and a shield bash, without voices, under one second', 2],
  // Workers and villages.
  ['work-done', 'The sound of tools being set down on the ground and a small bright chime of a finished job, without voices, about one second', 2],
  ['timber', 'The sound of a tree creaking and crashing to the ground through branches, without voices, about two seconds', 2],
  ['hut-map', 'The sound of an old parchment map being unrolled on a wooden table, without voices, about one second', 2],
  ['hut-empty', 'The sound of wind blowing through an abandoned village of empty huts, a loose door knocking softly, without voices, about one and a half seconds', 2],
  // Empire and diplomacy.
  ['warning', 'The sound of a low two-note bronze bell signalling a problem, calm but clear, without voices, about one second', 2],
  ['quill', 'The sound of a quill pen scratching quickly on parchment, without voices, under one second', 2],
  ['turn-start', 'The sound of a single soft temple bell with a gentle warm ring, without voices, about one and a half seconds', 2],
  ['golden-age-ended', 'The sound of a harp glissando that slowly descends and fades, warm and wistful, without voices, about two seconds', 2],
  ['treaty-expired', 'The sound of a parchment scroll being rolled up and a wax seal cracking, without voices, about one second', 2],
  ['city-ceded', 'The sound of a heavy ring of iron keys jingling and a stamp pressed onto a document, without voices, about one and a half seconds', 2],
  ['expelled', 'The sound of a drum beating a slow retreat as soldiers march away into the distance, without voices, about two seconds', 2],
  ['ui-select', 'The sound of a short soft click of a leather strap and a metal buckle, without voices, under half a second', 2],
  // Era music beds, looped quietly under play.
  ['music-ancient', 'The sound of a calm instrumental theme for an ancient civilization: lyre, frame drum and a soft reed flute over a warm drone, slow and spacious, no singing, about thirty seconds', 3],
  ['music-medieval', 'The sound of a calm instrumental theme for a medieval kingdom: lute, recorder and a gentle string section with a slow pulse, no singing, about thirty seconds', 3],
  ['music-industrial', 'The sound of a calm instrumental theme for the industrial age: piano and a romantic string orchestra with soft horns, hopeful and steady, no singing, about thirty seconds', 3],
  ['music-modern', 'The sound of a calm instrumental theme for the modern age: ambient synthesizer pads, light piano and soft strings, wide and thoughtful, no singing, about thirty seconds', 3],
  ['music-title', 'The sound of a grand but gentle orchestral main theme for a game about the history of civilization: strings, horns and timpani building slowly, no singing, about thirty seconds', 1],
  // Ambiences, faded in by what the camera looks at.
  ['ambience-grassland', 'The sound of a peaceful open meadow: a light breeze through grass, distant birdsong and insects, without voices, about twenty seconds', 2],
  ['ambience-forest', 'The sound of a deep forest: leaves rustling, woodpecker and songbirds, a creaking branch, without voices, about twenty seconds', 2],
  ['ambience-desert', 'The sound of a desert: a dry hot wind with sand hissing over dunes, without voices, about twenty seconds', 2],
  ['ambience-snow', 'The sound of a cold snowy tundra: a hollow howling wind and snow crunching faintly, without voices, about twenty seconds', 2],
  ['ambience-ocean', 'The sound of the open sea: rolling waves, gentle surf and distant gulls, without voices, about twenty seconds', 2],
  ['ambience-city', 'The sound of a busy old town market heard from a distance: indistinct murmur of a crowd without clear words, carts, hammering and a dog barking, about twenty seconds', 2],
];
writeFileSync(
  resolve(here, '../manifests/phase7-sounds.json'),
  `${JSON.stringify(
    {
      $comment:
        "Phase 7 sound effects, music beds and ambiences (ByteDance Seed Audio on OpenRouter). Run: OPEN_ROUTER_KEY=... pnpm --filter @civolution/assets sounds -- --manifest manifests/phase7-sounds.json. Every prompt starts with 'The sound of' (the tool adds it when missing).",
      model: 'bytedance-seed/seed-audio-1-0',
      outDir: 'packages/client/public/audio',
      items: SOUNDS.map(([id, prompt, variations]) => ({ id, prompt, variations })),
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote manifests/phase7.json with ${items.length} items and manifests/phase7-sounds.json with ${SOUNDS.length} sounds.`);
