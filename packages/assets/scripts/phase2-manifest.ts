/**
 * `pnpm --filter @civolution/assets manifest:phase2` writes manifests/phase2.json: the 2D
 * art Phase 2's screens use (building and wonder icons, tech medallions, government
 * emblems, citizen and specialist portraits, unit portraits for the build list). Subjects
 * are written here in our own words; the rule set only supplies the list of ids.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexRules, isCommonUnit } from '@civolution/engine';
import { conquests } from '@civolution/rules';

const here = dirname(fileURLToPath(import.meta.url));
const rules = indexRules(conquests);
const phase1 = JSON.parse(readFileSync(resolve(here, '../manifests/phase1.json'), 'utf8')) as {
  modelPreference: string[];
  styleBible: unknown;
  styleSuffix: string;
};

const BUILDINGS: Record<string, string> = {
  palace: 'a stately palace with a golden dome, banners and a broad stair',
  barracks: 'a fortified barracks yard with racks of spears and shields and a training dummy',
  granary: 'a round clay granary with a thatched roof and sacks of grain spilling wheat',
  temple: 'a small stone temple with columns and an altar flame at its steps',
  marketplace: 'a lively market stall with an awning, baskets of fruit, cloth and coins',
  library: 'shelves of scrolls and bound books in a sunlit reading room',
  courthouse: 'a columned courthouse with a judge’s gavel and balance scales in front',
  walls: 'a stretch of sturdy stone city wall with a gate tower and battlements',
  aqueduct: 'a tall stone aqueduct of arches carrying a channel of clear water',
  bank: 'a grand bank front with a heavy vault door and stacks of gold coins',
  cathedral: 'a soaring cathedral with a rose window and twin bell towers',
  university: 'a university quadrangle with a clock tower and scholars’ gowns',
  colosseum: 'an oval stone arena with tiers of arches under a bright sky',
  factory: 'a brick factory hall with saw-tooth roofs and smoking chimneys',
  manufacturingPlant: 'a vast modern assembly hall with robotic arms and conveyor belts',
  recyclingCenter: 'a recycling plant with sorted bales and the circular arrows symbol',
  coalPlant: 'a coal power station with cooling chimney, coal heaps and pylons',
  hydroPlant: 'a concrete hydroelectric dam with water rushing through its gates',
  nuclearPlant: 'a nuclear power station with two hyperbolic cooling towers and steam',
  hospital: 'a white hospital building with a red cross sign and an ambulance bay',
  researchLab: 'a research laboratory with glassware, a microscope and glowing screens',
  massTransitSystem: 'a sleek electric tram gliding along a tree-lined city street',
  samMissileBattery: 'a surface-to-air missile launcher with radar dish on a concrete pad',
  coastalFortress: 'a stone coastal fortress with cannons facing the sea',
  solarPlant: 'rows of shining solar panels under a bright sun',
  harbor: 'a busy wooden harbour with piers, fishing boats and stacked crates',
  offshorePlatform: 'an offshore drilling platform standing in the open sea',
  airport: 'an airport control tower with a jet airliner on the runway',
  policeStation: 'a city police station with a blue lamp and a patrol car',
  wealth: 'a heap of gold coins and a treasure chest overflowing with riches',
  pyramids: 'the great pyramids of the desert rising golden in the sun',
  hangingGardens: 'terraced hanging gardens cascading with greenery and waterfalls',
  colossus: 'a gigantic bronze statue straddling a harbour entrance',
  greatLighthouse: 'a towering ancient lighthouse with a beacon fire at the top beside the sea',
  greatLibrary: 'a monumental ancient library hall filled with scroll shelves',
  oracle: 'a mountain temple of the oracle with a priestess and incense smoke',
  greatWall: 'a great wall snaking across green hills with watchtowers',
  sunTzusArtOfWar: 'an open bamboo scroll of military strategy beside a general’s helmet',
  sistineChapel: 'a chapel ceiling painted with grand heavenly frescoes',
  magellansVoyage: 'a three-masted carrack with a globe and compass, sailing around the world',
  copernicusObservatory: 'an observatory tower with a brass telescope and orbiting planets model',
  shakespearesTheater: 'a round timber-framed theatre with a stage, curtain and masks',
  leonardosWorkshop: 'a Renaissance inventor’s workshop with gears, sketches and a flying machine',
  jsBachsCathedral: 'a cathedral organ with towering pipes and sheet music',
  newtonsUniversity: 'a scholar’s desk with an apple, prisms and gravity diagrams',
  smithsTradingCompany: 'a merchant company house with ledgers, scales and trading ships',
  universalSuffrage: 'a ballot box with many hands casting votes',
  hooverDam: 'a colossal curved concrete dam holding back a blue reservoir',
  theoryOfEvolution: 'a naturalist’s journal with finch sketches and a fossil',
  unitedNations: 'a gathering of nations: a round assembly hall with many flags',
  manhattanProject: 'a secret laboratory with an atom symbol and glowing apparatus',
  cureForCancer: 'a glowing double-helix DNA strand beside a healing lab',
  longevity: 'an elderly smiling couple in a blooming garden with an hourglass',
  setiProgram: 'a giant radio telescope dish pointed at a starry night sky',
  heroicEpic: 'an epic illuminated book with a hero’s laurel wreath',
  ironWorks: 'a blazing iron foundry with molten metal pouring from a crucible',
  forbiddenPalace: 'a grand red and gold palace with tiered roofs behind walls',
  militaryAcademy: 'a military academy with cadets in formation and crossed sabres',
  pentagon: 'a five-sided headquarters building seen from above',
  wallStreet: 'a stock exchange floor with a ticker board and a bull statue',
  apolloProgram: 'a rocket on a launch pad with a mission control dish',
  strategicMissileDefense: 'an interceptor missile streaking up from a defensive shield dome',
  intelligenceAgency: 'a spy agency desk with a magnifying glass, files and a hat',
  battlefieldMedicine: 'a field medic’s tent with a stretcher and a red cross',
  internet: 'a glowing globe wrapped in a web of light connections',
  civilDefense: 'an air raid shelter entrance with sandbags and a siren',
  stockExchange: 'a stately stock exchange building with columns and rising charts',
  commercialDock: 'a large commercial dock with cranes loading cargo ships',
  templeOfArtemis: 'a vast marble temple of many columns dedicated to the huntress',
  statueOfZeus: 'an enthroned colossal statue of the sky god in ivory and gold',
  mausoleumOfMausollos: 'a grand marble tomb with a stepped roof and a chariot on top',
  knightsTemplar: 'a crusader fortress with knights’ banners and a red cross shield',
  secretPoliceHq: 'a grim grey headquarters with searchlights and guards',
};

const TECHS: Record<string, string> = {
  bronzeWorking: 'a bronze sword and shield cast in a mould', masonry: 'cut stone blocks with a mason’s hammer and chisel',
  alphabet: 'clay tablet with early carved letters', pottery: 'a painted clay pot on a potter’s wheel',
  theWheel: 'a wooden spoked wheel', warriorCode: 'crossed bow and arrows with a war banner',
  ceremonialBurial: 'a burial mound with standing stones', ironWorking: 'an anvil with a glowing iron bar and hammer',
  writing: 'a reed pen writing on papyrus', mysticism: 'a starry astrology chart with a crystal',
  mathematics: 'an abacus with geometric compass and triangle', philosophy: 'a thinker’s bust with a scroll',
  codeOfLaws: 'a stone stele carved with laws', literature: 'an open book with a quill and ink',
  mapMaking: 'a hand-drawn coastal map with a compass rose', horsebackRiding: 'a horse with a simple saddle and bridle',
  polytheism: 'a circle of carved god statues', currency: 'a pile of stamped ancient coins',
  theRepublic: 'a senate hall with a laurel wreath', monarchy: 'a jewelled crown and sceptre',
  construction: 'a wooden crane lifting a stone block', monotheism: 'a single radiant light above a temple dome',
  feudalism: 'a castle keep with a lord’s banner and fields', engineering: 'a stone arch bridge blueprint with gears',
  theology: 'an illuminated holy manuscript and candles', chivalry: 'a knight’s helmet with plume and a lance',
  invention: 'gears, levers and a sketch of a machine', printingPress: 'a wooden printing press with fresh pages',
  musicTheory: 'a lute with sheets of musical notation', education: 'a teacher’s lectern with books and a globe',
  gunpowder: 'a powder keg with a matchlock gun', banking: 'a merchant’s counting table with a ledger and coins',
  astronomy: 'a brass telescope pointed at the moon and stars', chemistry: 'glass flasks and a bubbling alembic',
  democracy: 'a ballot urn with voting stones', economics: 'a balance scale weighing goods against gold',
  navigation: 'a sextant over a sea chart', physics: 'a pendulum and falling-weight diagram',
  metallurgy: 'a cannon barrel being cast in a foundry', freeArtistry: 'an artist’s easel with palette and brushes',
  theoryOfGravity: 'an apple falling beside orbiting planets', magnetism: 'a magnetic compass needle with iron filings',
  militaryTradition: 'crossed sabres over a regimental drum', nationalism: 'a waving national flag with a crowd',
  steamPower: 'a steam engine with pistons and puffing steam', medicine: 'a physician’s bag with a stethoscope and herbs',
  communism: 'a hammer and sickle-like workers’ tools crossed over a gear', industrialization: 'a row of factory chimneys with smoke',
  electricity: 'a glowing light bulb with lightning sparks', scientificMethod: 'a notebook with experiment diagrams and a microscope',
  sanitation: 'clean water pipes and a sewer tunnel', espionage: 'a trench coat, magnifier and secret dossier',
  theCorporation: 'an office tower with a company logo-less emblem and graphs', refining: 'an oil refinery with tanks and pipes',
  steel: 'steel girders and a riveted I-beam', atomicTheory: 'an atom model with orbiting electrons',
  combustion: 'an internal combustion engine cutaway', replaceableParts: 'standardised bolts, nuts and interchangeable gears',
  flight: 'an early biplane in flight', amphibiousWar: 'a landing craft hitting a beach',
  massProduction: 'an assembly line of identical cars', electronics: 'vacuum tubes and a radio set',
  motorizedTransportation: 'a vintage truck on a paved road', advancedFlight: 'a jet fighter breaking through clouds',
  rocketry: 'a rocket lifting off with a fiery trail', fission: 'a splitting atom releasing energy',
  computers: 'a computer with a glowing screen and circuit board', recycling: 'circular recycling arrows around a green leaf',
  spaceFlight: 'an astronaut floating above the earth', nuclearPower: 'a glowing reactor core in blue light',
  superconductor: 'a magnet levitating over a cold superconductor', miniaturization: 'a tiny microchip on a fingertip',
  ecology: 'a green earth with forests and rivers', syntheticFibers: 'spools of shiny synthetic thread',
  satellites: 'a satellite orbiting the earth with solar wings', theLaser: 'a bright red laser beam through a crystal',
  genetics: 'a double helix strand of DNA', stealth: 'a black angular stealth aircraft',
  smartWeapons: 'a guided missile with a targeting reticle', robotics: 'an industrial robot arm',
  integratedDefense: 'a radar network dome over a city', ironclads: 'an armoured steam warship',
  fascism: 'a stern marching column with standards',
};

const GOVERNMENTS: Record<string, string> = {
  anarchy: 'a broken crown on a cracked shield with flames',
  despotism: 'a clenched fist holding a whip on a dark shield',
  monarchy: 'a royal crown over crossed sceptres on a purple shield',
  communism: 'a red star over crossed worker’s tools on a red shield',
  republic: 'a laurel wreath around a senate column on a blue shield',
  democracy: 'a ballot and an open hand on a sky-blue shield',
  fascism: 'a bundle of rods with an axe on a black shield',
  feudalism: 'a castle tower over a wheat field on a green shield',
};

const PEOPLE: Record<string, string> = {
  happy: 'a cheerful smiling townsperson in simple clothes, raising a cup',
  content: 'a calm content townsperson with a gentle neutral expression',
  unhappy: 'an angry frowning townsperson shaking a fist',
  laborer: 'a sturdy labourer carrying a hoe over the shoulder',
  entertainer: 'a jester-like entertainer juggling colourful balls',
  taxCollector: 'a tax collector with a ledger and a heavy coin purse',
  scientist: 'a scientist in spectacles holding a glowing flask',
  policeman: 'a policeman in a helmet with a whistle',
  civilEngineer: 'a civil engineer with a hard hat and blueprints',
};

const UNITS: Record<string, string> = {
  settler: 'pioneer family with a laden ox cart', worker: 'labourer with a pickaxe and shovel',
  explorer: 'explorer with a wide-brimmed hat and a spyglass', marine: 'modern marine in camouflage with a rifle',
  modernParatrooper: 'modern paratrooper with a parachute pack and rifle', warrior: 'tribal warrior with a club and hide shield',
  archer: 'ancient archer drawing a bow', spearman: 'spearman with a bronze helmet, spear and round shield',
  swordsman: 'legion swordsman with a short sword and rectangular shield', chariot: 'two-horse war chariot with a driver',
  horseman: 'light horseman riding bareback with a javelin', pikeman: 'medieval pikeman with a long pike and steel helmet',
  longbowman: 'longbowman in a green hood with a tall bow', musketman: 'musketeer with a matchlock musket and plumed hat',
  knight: 'armoured knight on a barded warhorse with a lance', rifleman: 'rifleman in a nineteenth-century uniform with a bayonet',
  cavalry: 'cavalryman with a sabre on a galloping horse', infantry: 'early twentieth-century infantryman with a rifle and helmet',
  tank: 'mid-century battle tank with a long gun', mechInfantry: 'armoured troop carrier with soldiers',
  modernArmor: 'modern main battle tank', catapult: 'wooden torsion catapult',
  cannon: 'bronze field cannon on wooden wheels', artillery: 'heavy howitzer with a crew',
  radarArtillery: 'self-propelled rocket artillery with radar', cruiseMissile: 'cruise missile in flight',
  tacticalNuke: 'small tactical nuclear missile on a launcher', icbm: 'intercontinental ballistic missile rising from a silo',
  galley: 'oared galley with a square sail', caravel: 'small two-masted caravel with lateen sails',
  frigate: 'square-rigged frigate with gun ports', galleon: 'large galleon with high stern and full sails',
  ironclad: 'black armoured steam ironclad', transport: 'steel troop transport ship',
  carrier: 'aircraft carrier with jets on deck', submarine: 'diesel submarine at the surface',
  destroyer: 'fast grey destroyer cutting through waves', battleship: 'massive battleship with triple gun turrets',
  aegisCruiser: 'modern guided missile cruiser with radar arrays', nuclearSubmarine: 'nuclear submarine with a conning tower',
  fighter: 'propeller fighter plane', bomber: 'four-engine propeller bomber',
  helicopter: 'transport helicopter', jetFighter: 'swept-wing jet fighter',
  stealthFighter: 'angular stealth fighter jet', stealthBomber: 'flying-wing stealth bomber',
  privateer: 'privateer ship with a black flag', medievalInfantry: 'medieval foot soldier with a mace and kite shield',
  guerilla: 'guerrilla fighter in a jungle with a rifle', trebuchet: 'wooden counterweight trebuchet',
  cruiser: 'armoured cruiser of the dreadnought age', curragh: 'small hide-covered curragh boat with oars',
  paratrooper: 'world-war paratrooper descending under a parachute', towInfantry: 'soldier aiming a wire-guided anti-tank missile',
  flak: 'anti-aircraft gun on a towed mount', mobileSam: 'truck-mounted surface-to-air missile launcher',
};

type Item = { id: string; prompt: string; aspectRatio: string; out: string; post: { resize: number; circleMask?: boolean }; references: string[] };
const items: Item[] = [];
const ref = ['styleBible'];

for (const b of rules.set.buildings) {
  if (b.id.startsWith('ss')) continue;
  const subject = BUILDINGS[b.id];
  if (!subject) throw new Error(`no subject for building ${b.id}`);
  const wonder = b.kind === 'wonder' || b.kind === 'smallWonder';
  items.push({
    id: `building-${b.id}`,
    prompt: `Game icon of ${wonder ? 'a world wonder' : 'a city building'}: ${subject}. Seen at a slight three-quarter angle, filling a rounded-square tile with a soft ${wonder ? 'golden' : 'slate blue'} gradient background and a thin ${wonder ? 'gold' : 'bronze'} border. No text. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/buildings/${b.id}.png`,
    post: { resize: 192 },
    references: ref,
  });
}
for (const t of rules.set.techs) {
  const subject = TECHS[t.id];
  if (!subject) throw new Error(`no subject for tech ${t.id}`);
  items.push({
    id: `tech-${t.id}`,
    prompt: `Game icon for a technology: ${subject}. Centered on a round medallion with a deep blue background and a thin bronze rim, the subject filling most of the circle, nothing outside the circle (plain dark background around it). No text. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/techs/${t.id}.png`,
    post: { resize: 160, circleMask: true },
    references: ref,
  });
}
for (const g of rules.set.governments) {
  items.push({
    id: `government-${g.id}`,
    prompt: `Heraldic emblem for a form of government: ${GOVERNMENTS[g.id] ?? g.name}. A single bold shield-shaped crest centered on a plain dark background. No text. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/governments/${g.id}.png`,
    post: { resize: 160 },
    references: ref,
  });
}
for (const [id, subject] of Object.entries(PEOPLE)) {
  items.push({
    id: `people-${id}`,
    prompt: `Small round portrait for a city screen: head and shoulders of ${subject}. Centered on a round medallion with a warm parchment background, nothing outside the circle (plain dark background around it). No text. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/people/${id}.png`,
    post: { resize: 128, circleMask: true },
    references: ref,
  });
}
for (const u of rules.set.units) {
  if (!isCommonUnit(rules, u.id)) continue;
  const subject = UNITS[u.id];
  if (!subject) throw new Error(`no subject for unit ${u.id}`);
  items.push({
    id: `unit-${u.id}`,
    prompt: `Game portrait of a unit: a ${subject}, shown whole and in profile, centered on a round medallion with a soft sky-and-earth background and a thin bronze rim, nothing outside the circle (plain dark background around it). No text. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/units/${u.id}.png`,
    post: { resize: 160, circleMask: true },
    references: ref,
  });
}

const manifest = {
  $comment:
    'Phase 2 art, written by scripts/phase2-manifest.ts. Generate with: OPEN_ROUTER_KEY=... pnpm --filter @civolution/assets gen -- --manifest manifests/phase2.json. Reuses the Phase 1 style bible as the reference image.',
  modelPreference: phase1.modelPreference,
  styleBible: phase1.styleBible,
  styleSuffix: phase1.styleSuffix,
  items,
};
writeFileSync(resolve(here, '../manifests/phase2.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote manifests/phase2.json with ${items.length} items.`);
