/**
 * `pnpm --filter @civolution/assets manifest:phase4` writes manifests/phase4.json: the 2D
 * art Phase 4's screens use: a portrait for every leader, the diplomacy chamber, icons
 * for deal items and espionage missions, and headline illustrations for diplomatic news.
 * Subjects are written here in our own words; leaders are painted as historical figures,
 * never after any game's artwork.
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

/** Leader portraits by civilization id (rules.set.civs). */
const LEADERS: Record<string, string> = {
  romans: 'a Roman emperor in his fifties with short grey hair and a laurel wreath, wearing a white toga with a purple border over a bronze cuirass, in a marble hall with red drapery',
  egyptians: 'an Egyptian queen of the Ptolemaic era with dark braided hair, a golden vulture crown with a cobra and a broad jewelled collar, before sandstone columns painted with lotus motifs',
  greeks: 'a young Macedonian king with tousled golden hair, a bronze cuirass decorated with a gorgon head and a red cloak, before a sunlit Greek temple',
  babylonians: 'an ancient Mesopotamian king with a long curled black beard and a tall rounded cap, in fringed robes, before a blue glazed-brick wall with golden lions',
  germans: 'a nineteenth-century Prussian statesman with a bald head and a thick grey moustache, in a dark military coat with a high collar and a spiked helmet held at his side, in a wood-panelled study',
  russians: 'an eighteenth-century Russian empress with powdered grey hair, a small jewelled crown and an ermine-trimmed blue sash over a silver gown, in a gilded palace hall',
  chinese: 'a twentieth-century Chinese leader in his sixties in a grey buttoned tunic suit, calm expression, before red lacquered columns and a misty landscape scroll',
  americans: 'a tall nineteenth-century American president with a dark chin beard and no moustache, in a black frock coat and bow tie, in a study with a flag in the background',
  japanese: 'a Japanese shogun of the early seventeenth century in dark lacquered armour with a crested helmet beside him, seated before painted paper screens with pine trees',
  french: 'a young French heroine of the fifteenth century with short dark hair in polished plate armour, holding a white banner with golden lilies, before a cathedral at dawn',
  indians: 'an Indian leader of the twentieth century, an elderly slight man with round spectacles and a white homespun shawl, smiling gently, before a spinning wheel and a sunlit courtyard',
  persians: 'an ancient Persian king with a long square curled beard and a tall fluted crown, in purple and gold robes, before the columns of a palace with bull capitals',
  aztecs: 'an Aztec emperor with a magnificent green quetzal-feather headdress, jade earspools and a turquoise cloak, before a stepped stone temple',
  zulu: 'a Zulu king of the early nineteenth century, powerful build, with a headband of leopard skin, feathers and a cowhide shield and short spear, on a grassy hillside',
  iroquois: 'an Iroquois statesman with a feathered gustoweh headdress, a wampum belt and a deerskin mantle, in an autumn forest by a longhouse',
  english: 'an English queen of the sixteenth century with red curled hair, pale complexion, a jewelled ruffled collar and pearls, in a tapestried palace hall',
  mongols: 'a Mongol khan with a weathered face and a long thin moustache, wearing a fur-trimmed helmet and lamellar armour, on the open steppe under a vast sky',
  spanish: 'a Castilian queen of the fifteenth century with auburn hair under a gold circlet and a veil, in a deep red velvet gown, before a Moorish arch',
  vikings: 'a Viking chieftain with a braided blond beard, an iron helmet without horns and a fur cloak, at the prow of a longship in a fjord',
  ottomans: 'an Ottoman sultan of the fourteenth century with a full dark beard and a large white turban, in a richly embroidered kaftan, before tiled arches',
  celts: 'a Celtic war chief with a long drooping moustache, a golden torc at the neck and a checked cloak, before a misty hill fort',
  arabs: 'an early Arab caliph, a dignified elderly man with a white beard, a simple white headcloth and robes, in a courtyard with palm trees',
  carthaginians: 'a Carthaginian general with curly black hair and beard, in a bronze helmet and a purple cloak, with war elephants and mountains behind',
  koreans: 'a Korean king of the tenth century with a black winged hat and red dragon-embroidered robes, before a palace with curved tiled roofs',
  sumerians: 'a legendary Sumerian king with a long braided beard and a golden helmet, bare-chested with a sheepskin skirt, before a mud-brick ziggurat',
  hittites: 'a Hittite king with a tall conical cap and a long robe, holding a curved staff, before a stone gate carved with lions',
  dutch: 'a seventeenth-century Dutch prince with long dark curled hair, a lace collar and a steel breastplate with an orange sash, before a harbour full of tall ships',
  portuguese: 'a Portuguese prince of the fifteenth century, a serious man with a dark moustache and a large black chaperon hat, before maps and a navigator\'s astrolabe',
  byzantines: 'a Byzantine empress with a jewelled crown hung with pearls and a purple robe embroidered in gold, before a golden mosaic',
  inca: 'an Inca emperor with a royal fringe headband, large golden ear spools and a geometric tunic, before terraced mountains and stone walls',
  maya: 'a Maya king with a towering jade and feather headdress and a jaguar-skin cape, before a white stone pyramid in the jungle',
};

/** Deal items and treaties (art/diplomacy/<kind>.png). */
const DEAL_ICONS: Record<string, string> = {
  gold: 'a small heap of gold coins',
  goldPerTurn: 'a stack of gold coins beside a small hourglass',
  tech: 'an open book with a glowing quill and a small brass gear',
  worldMap: 'a rolled-out parchment map with a compass rose',
  contact: 'two hands reaching toward each other across a stylised globe',
  embassy: 'a small classical embassy building with a flag on its roof',
  resource: 'a wooden crate with grapes, silk and an iron ingot spilling out',
  city: 'a small walled city with towers on a hill',
  peace: 'a white dove with an olive branch',
  ceasefire: 'a white flag on a spear planted in the ground',
  rightOfPassage: 'an open city gate with a road passing through',
  mutualProtection: 'two shields overlapping each other',
  alliance: 'two crossed swords tied together with a ribbon',
  embargo: 'a padlocked chain across a cargo crate',
};

/** Espionage missions (art/diplomacy/<mission>.png; the embassy shares the deal icon). */
const SPY_ICONS: Record<string, string> = {
  investigateCity: 'a magnifying glass over a small city',
  stealTechnology: 'a hand in a dark glove taking a glowing scroll',
  stealWorldMap: 'a dark-gloved hand rolling up a parchment map',
  plantSpy: 'a hooded figure in a dark cloak with a wide-brimmed hat',
  stealPlans: 'a folded battle plan with little unit markers and a candle',
  propaganda: 'a speaking trumpet with leaflets fluttering out',
  sabotageProduction: 'a broken cogwheel with a lit fuse',
  exposeEnemySpy: 'a lantern lighting up a cloaked figure in a dark alley',
};

/** Headline illustrations for diplomatic news (art/news/<kind>.jpg). */
const NEWS: Record<string, string> = {
  contactMade: 'two groups of travellers from different lands meeting on a hilltop road at sunrise, one raising an open hand in greeting',
  ceasefireEnded: 'soldiers taking down a white flag and picking up their spears again at the edge of a quiet battlefield at dusk',
  treatyBroken: 'a torn treaty parchment with a broken wax seal lying on a council table, a dagger stuck through it, candles guttering',
  cityRevolted: 'townspeople in a city square raising a new banner over the gate while the old one is lowered, crowds cheering',
  barbarianLanding: 'longboats of barbarian raiders running onto a beach below a coastal town, warriors leaping into the surf',
  spyCaught: 'a cloaked spy caught by lantern light by two city guards in a narrow cobbled alley at night',
};

type Item = { id: string; prompt: string; aspectRatio: string; out: string; post: { resize: number; circleMask?: boolean; roundedMask?: number }; references: string[] };
const items: Item[] = [];
const ref = ['styleBible'];

for (const [id, subject] of Object.entries(LEADERS)) {
  items.push({
    id: `leader-${id}`,
    prompt: `Painted head-and-shoulders portrait of a historical ruler for a strategy game's diplomacy screen: ${subject}. Facing the viewer, dignified, expressive, looking into the camera, softly lit from the upper left, the face in the middle of the image with space around it. Hand-painted, stylised but respectful, not a caricature. No text, no letters, no frame. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/leaders/${id}.jpg`,
    post: { resize: 320 },
    references: ref,
  });
}
items.push({
  id: 'diplomacy-chamber',
  prompt: 'A grand council chamber for diplomacy in a strategy game: a long table with maps and candles under tall arched windows, banners of many colours without any emblems or writing hanging from the walls, warm evening light, empty of people. Wide composition with calm areas for interface panels. No text, no letters. Landscape image.',
  aspectRatio: '16:9',
  out: 'packages/client/public/art/diplomacy/chamber.jpg',
  post: { resize: 1280 },
  references: ref,
});
for (const [id, subject] of [...Object.entries(DEAL_ICONS), ...Object.entries(SPY_ICONS)]) {
  items.push({
    id: `diplomacy-${id}`,
    prompt: `Small round game icon: ${subject}, centered on a round deep navy enamel medallion with a thin bronze rim, the rim touching all four edges of the image so the medallion fills the whole square. Bold, simple shapes, readable at very small size. No text, no letters, no numbers. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/diplomacy/${id}.png`,
    post: { resize: 64, circleMask: true },
    references: ref,
  });
}
for (const [id, subject] of Object.entries(NEWS)) {
  items.push({
    id: `news-${id}`,
    prompt: `Painted illustration for a headline in a strategy game: ${subject}. Wide cinematic composition, dramatic but not gory, no close-up faces. No text, no letters, no lettering on banners or parchment. Landscape image.`,
    aspectRatio: '16:9',
    out: `packages/client/public/art/news/${id}.jpg`,
    post: { resize: 640 },
    references: ref,
  });
}

const manifest = {
  $comment:
    'Phase 4 art, written by scripts/phase4-manifest.ts. Generate with: OPEN_ROUTER_KEY=... pnpm --filter @civolution/assets gen -- --manifest manifests/phase4.json. Reuses the Phase 1 style bible as the reference image.',
  modelPreference: phase2.modelPreference,
  styleBible: phase2.styleBible,
  styleSuffix: phase2.styleSuffix,
  items,
};
writeFileSync(resolve(here, '../manifests/phase4.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote manifests/phase4.json with ${items.length} items.`);
