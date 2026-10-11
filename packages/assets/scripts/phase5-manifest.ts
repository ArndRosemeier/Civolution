/**
 * `pnpm --filter @civolution/assets manifest:phase5` writes manifests/phase5.json: the
 * icons Phase 5's automation screens use (art/automation/<name>.png): the city governors,
 * the delegated aspects of the game, templates, rally points and rules, and one per kind
 * of turn-digest entry. Subjects are written here in our own words.
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

/** City governors (GOVERNORS in @civolution/automation), plus custom weights and "no governor". */
const GOVERNORS: Record<string, string> = {
  balanced: 'a brass balance scale with a wheat sheaf on one pan and a small hammer on the other, perfectly level',
  growth: 'a lush golden wheat sheaf bursting with grain beside a full clay granary jar',
  production: 'a blacksmith hammer striking a glowing ingot on an anvil with bright sparks',
  gold: 'a tall stack of gold coins beside an open leather purse',
  science: 'a brass astrolabe resting on an open book with a candle',
  culture: 'a golden laurel wreath around a small classical lyre',
  militaryPump: 'two crossed swords above an anvil with a glowing blade',
  settlerPump: 'a covered pioneer wagon with a wooden wheel and a bundle of tools',
  custom: 'three brass weights of different sizes lined up on a small wooden board',
  manual: 'an open hand holding a quill above parchment',
};

/** Aspects of the game that can be delegated (Delegation in the engine). */
const ASPECTS: Record<string, string> = {
  cities: 'a small city gate with two citizens walking through it',
  builds: 'a wooden building scaffold with a small crane lifting a stone block',
  workers: 'a crossed pickaxe and shovel over a patch of tilled earth',
  research: 'a lit oil lamp beside a stack of rolled scrolls',
  rates: 'an open treasure chest with gold coins and a small balance scale',
  military: 'a round shield with a spear leaning against it',
  diplomacy: 'two hands clasping over a letter sealed with red wax',
};

/** Other automation icons. */
const MISC: Record<string, string> = {
  template: 'a rolled architectural plan tied with string beside a drafting compass, the plan blank without any writing',
  rally: 'a red banner on a tall pole planted on a green hilltop',
  rule: 'three interlocking brass gears turning together',
  digest: 'a parchment scroll half unrolled and tied with a ribbon, the parchment blank',
};

/** Turn-digest entries (DigestKind in @civolution/automation; research and workers reuse the aspect icons). */
const DIGEST: Record<string, string> = {
  threat: 'three enemy spear tips rising behind a stone city wall',
  disorder: 'a burning torch above a cracked city wall',
  offer: 'a folded envelope with a red wax seal',
  idleCity: 'an empty building site with stacked bricks and idle tools',
  idleUnits: 'a soldier helmet resting on a tree stump',
  starving: 'an empty wooden bowl with a few scattered grains',
  resourceLost: 'a broken iron chain link',
  resourceGained: 'two joined chain links with a glowing gemstone',
  notice: 'a small brass hand bell',
  handled: 'a brass seal stamp pressed onto blank parchment',
};

type Item = { id: string; prompt: string; aspectRatio: string; out: string; post: { resize: number; circleMask?: boolean }; references: string[] };
const items: Item[] = [];
const ref = ['styleBible'];

const icon = (id: string, subject: string, size: number) =>
  items.push({
    id: `automation-${id}`,
    prompt: `Small round game icon: ${subject}, centered on a round deep teal enamel medallion with a thin bronze rim, the rim touching all four edges of the image so the medallion fills the whole square. Bold, simple shapes, readable at very small size. Absolutely no text: no letters, no numbers, no writing on any paper, scroll, plan or banner. Square image.`,
    aspectRatio: '1:1',
    out: `packages/client/public/art/automation/${id}.png`,
    post: { resize: size, circleMask: true },
    references: ref,
  });

for (const [id, subject] of Object.entries(GOVERNORS)) icon(id, subject, 96);
for (const [id, subject] of Object.entries(ASPECTS)) icon(id, subject, 96);
for (const [id, subject] of Object.entries(MISC)) icon(id, subject, 96);
for (const [id, subject] of Object.entries(DIGEST)) icon(id, subject, 64);

const manifest = {
  $comment:
    'Phase 5 art, written by scripts/phase5-manifest.ts. Generate with: OPEN_ROUTER_KEY=... pnpm --filter @civolution/assets gen -- --manifest manifests/phase5.json. Reuses the Phase 1 style bible as the reference image.',
  modelPreference: phase2.modelPreference,
  styleBible: phase2.styleBible,
  styleSuffix: phase2.styleSuffix,
  items,
};
writeFileSync(resolve(here, '../manifests/phase5.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote manifests/phase5.json with ${items.length} items.`);
