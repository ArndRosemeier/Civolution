/**
 * `pnpm --filter @civolution/assets gen -- --manifest manifests/phase1.json [--force] [--only id,id] [--dry-run]`
 *
 * Generates 2D art from a manifest through OpenRouter (PLAN.md §10.3): the style bible
 * first, then every item with the style bible as a reference image (where the model
 * accepts references). Outputs are post-processed (resize, circular mask for icons)
 * or made seamless for tiling textures) and recorded with their provenance (model, prompt, date, cost) next to the art.
 * Items whose output exists with the same input hash are skipped, so re-runs are cheap.
 * The key comes from OPEN_ROUTER_KEY.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { z } from 'zod';
import { generateImages, imageModels } from './openrouter/images.ts';
import { makeSeamless } from './seamless.ts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const itemSchema = z.strictObject({
  id: z.string(),
  prompt: z.string(),
  aspectRatio: z.string().optional(),
  out: z.string(),
  post: z
    .strictObject({ resize: z.number().int().positive().optional(), circleMask: z.boolean().optional(), roundedMask: z.number().min(0).max(0.5).optional(), seamless: z.boolean().optional() })
    .optional(),
  references: z.array(z.string()),
});
const manifestSchema = z.strictObject({
  $comment: z.string().optional(),
  modelPreference: z.array(z.string()).min(1),
  styleBible: itemSchema,
  styleSuffix: z.string(),
  items: z.array(itemSchema),
});
type Item = z.infer<typeof itemSchema>;

const provenanceSchema = z.record(z.string(), z.object({ model: z.string(), prompt: z.string(), hash: z.string(), date: z.string(), costUsd: z.number().nullable() }));

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    manifest: { type: 'string', default: 'manifests/phase1.json' },
    force: { type: 'boolean', default: false },
    only: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    model: { type: 'string' },
    concurrency: { type: 'string', default: '1' },
  },
});

const manifestPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', values.manifest);
const manifest = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
const apiKey = process.env['OPEN_ROUTER_KEY'] ?? '';
const provenancePath = resolve(repo, 'packages/client/public/art/provenance.json');
const provenance = existsSync(provenancePath) ? provenanceSchema.parse(JSON.parse(readFileSync(provenancePath, 'utf8'))) : {};

async function postProcess(bytes: Buffer, item: Item): Promise<Buffer> {
  let img = sharp(bytes);
  // Models sometimes leave a plain margin around a tile or medallion; trim it so the mask cuts into the art, not the margin.
  if (item.post?.circleMask || item.post?.roundedMask) img = sharp(await img.trim({ threshold: 40 }).png().toBuffer());
  const size = item.post?.resize;
  if (size) img = img.resize({ width: size, height: item.post?.circleMask || item.post?.roundedMask ? size : undefined, fit: 'cover' });
  // Rounded-square tiles: cut the corners so stray background outside the tile never shows.
  if (item.post?.roundedMask && size) {
    const r = Math.round(size * item.post.roundedMask);
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  if (item.post?.circleMask && size) {
    const r = size / 2;
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r - 1}" fill="#fff"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  if (item.post?.seamless) img = sharp(await makeSeamless(await img.png().toBuffer()));
  return item.out.endsWith('.jpg') ? img.jpeg({ quality: 86 }).toBuffer() : img.png({ compressionLevel: 9 }).toBuffer();
}

async function main(): Promise<void> {
  const only = values.only ? new Set(values.only.split(',')) : null;
  // An existing style bible is kept (even under another model) unless --only names it, since all other art is drawn against it.
  const keepBible = !only?.has('styleBible') && existsSync(resolve(repo, manifest.styleBible.out));
  const queue = [...(keepBible ? [] : [manifest.styleBible]), ...manifest.items].filter((i) => !only || only.has(i.id) || i.id === 'styleBible');
  if (values['dry-run']) {
    for (const i of queue) console.log(`${i.id} -> ${i.out}\n  ${i.prompt}\n`);
    return;
  }
  const limits = await imageModels(apiKey);
  const model = values.model ?? manifest.modelPreference.find((m) => limits.has(m));
  if (!model) throw new Error(`none of ${manifest.modelPreference.join(', ')} is offered by /images/models; pass --model`);
  const lim = limits.get(model)!;
  console.log(`Model: ${model} (references up to ${lim.maxReferences}, aspect ratios ${lim.aspectRatios.join(' ') || 'default'})`);
  const done = new Map<string, string>();
  let total = 0;
  // The style bible goes first since the other items use it as their reference.
  const run = async (item: Item): Promise<void> => {
    const prompt = item.id === 'styleBible' ? item.prompt : `${item.prompt}\n\nStyle: ${manifest.styleSuffix}`;
    const refPaths = item.references.map((r) => (r === 'styleBible' ? manifest.styleBible.out : r)).filter((p) => existsSync(resolve(repo, p)));
    const refs = lim.maxReferences > 0 ? refPaths.slice(0, lim.maxReferences) : [];
    const hash = createHash('sha256')
      .update(JSON.stringify({ model, prompt, aspect: item.aspectRatio, post: item.post, refs: refs.map((p) => createHash('sha256').update(readFileSync(resolve(repo, p))).digest('hex')) }))
      .digest('hex')
      .slice(0, 16);
    const out = resolve(repo, item.out);
    if (!values.force && existsSync(out) && provenance[item.out]?.hash === hash) {
      console.log(`skip ${item.id} (unchanged)`);
      return;
    }
    const references = await Promise.all(
      refs.map(async (p) => `data:image/png;base64,${(await sharp(resolve(repo, p)).resize({ width: 1024, withoutEnlargement: true }).png().toBuffer()).toString('base64')}`),
    );
    const aspect = item.aspectRatio && lim.aspectRatios.includes(item.aspectRatio) ? item.aspectRatio : undefined;
    let result: Awaited<ReturnType<typeof generateImages>>;
    try {
      result = await generateImages({ apiKey, model, prompt, n: 1, aspectRatio: aspect, references });
    } catch (e) {
      failed.push(item.id);
      console.log(`FAIL ${item.id}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const { images, costUsd } = result;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, await postProcess(images[0]!.bytes, item));
    provenance[item.out] = { model, prompt, hash, date: new Date().toISOString().slice(0, 10), costUsd };
    writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
    total += costUsd ?? 0;
    done.set(item.id, item.out);
    console.log(`ok   ${item.id}${costUsd !== null ? ` ($${costUsd.toFixed(3)})` : ''}`);
  };
  const failed: string[] = [];
  const [first, ...rest] = queue;
  if (first) await run(first);
  const workers = Math.max(1, Number(values.concurrency));
  let next = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < rest.length) await run(rest[next++]!);
  }));
  if (failed.length) console.log(`Failed (rerun to retry): ${failed.join(',')}`);
  console.log(`Generated ${done.size} image(s), cost $${total.toFixed(2)}.`);
}

await main();
