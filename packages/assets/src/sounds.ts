/**
 * `pnpm --filter @civolution/assets sounds -- --manifest manifests/phase2-sounds.json [--force] [--only id,id] [--dry-run]`
 *
 * Generates sound effects through OpenRouter's audio endpoint (`POST /audio/speech`) with
 * ByteDance Seed Audio (PLAN.md §10.4). Seed Audio speaks the words unless the prompt
 * describes a sound, so every prompt is made to start with "The sound of …". Each item
 * can ask for several variations; outputs go to packages/client/public/audio/ with their
 * provenance next to them, and unchanged items are skipped. The key comes from
 * OPEN_ROUTER_KEY.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { headers, request } from './openrouter/client.ts';
import { MissingApiKeyError } from './openrouter/errors.ts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const itemSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-zA-Z0-9-]*$/),
  prompt: z.string(),
  variations: z.int().min(1).max(6).default(1),
});
const manifestSchema = z.strictObject({
  $comment: z.string().optional(),
  model: z.string(),
  outDir: z.string(),
  items: z.array(itemSchema),
});
const provenanceSchema = z.record(z.string(), z.object({ model: z.string(), prompt: z.string(), hash: z.string(), date: z.string() }));

/** Seed Audio needs "The sound of …" or it reads the prompt aloud. */
export function soundPrompt(prompt: string): string {
  const p = prompt.trim();
  return /^the sound of /i.test(p) ? p : `The sound of ${p.charAt(0).toLowerCase()}${p.slice(1)}`;
}

async function speech(apiKey: string, model: string, input: string): Promise<Buffer> {
  if (!apiKey) throw new MissingApiKeyError();
  const response = await request(
    '/audio/speech',
    { method: 'POST', headers: headers(apiKey), body: JSON.stringify({ model, input, response_format: 'mp3' }) },
    5 * 60 * 1000,
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`suspiciously small audio (${bytes.length} bytes): ${bytes.toString('utf8').slice(0, 200)}`);
  return bytes;
}

/**
 * Seed Audio renders at very uneven levels (quiet UI clicks peak near -45 dB) and pads clips
 * with silence, sometimes seconds of it. When ffmpeg is installed each clip is peak-normalised
 * to -1 dB and its leading and trailing silence is cut; the client sets loudness per category.
 * A clip with no real signal is an error.
 */
export function finishClip(bytes: Buffer): Buffer {
  const ffmpeg = (args: string[]) => spawnSync('ffmpeg', ['-hide_banner', '-i', 'pipe:0', ...args], { input: bytes, maxBuffer: 64 * 1024 * 1024 });
  const probe = ffmpeg(['-af', 'volumedetect', '-f', 'null', '-']);
  if (probe.error) return bytes; // no ffmpeg: keep the clip as rendered
  const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(probe.stderr.toString())?.[1] ?? Number.NaN);
  if (!(peak > -60)) throw new Error(`clip is silent (peak ${peak} dB)`);
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB';
  const filter = `volume=${(-1 - peak).toFixed(1)}dB,${trim},areverse,${trim},areverse`;
  const r = ffmpeg(['-loglevel', 'error', '-af', filter, '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'pipe:1']);
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.toString().slice(0, 200)}`);
  return r.stdout;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      manifest: { type: 'string', default: 'manifests/phase2-sounds.json' },
      force: { type: 'boolean', default: false },
      only: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', values.manifest), 'utf8')));
  const only = values.only ? new Set(values.only.split(',')) : null;
  const outDir = resolve(repo, manifest.outDir);
  const provenancePath = resolve(outDir, 'provenance.json');
  const provenance = existsSync(provenancePath) ? provenanceSchema.parse(JSON.parse(readFileSync(provenancePath, 'utf8'))) : {};
  const apiKey = process.env['OPEN_ROUTER_KEY'] ?? '';
  mkdirSync(outDir, { recursive: true });
  let made = 0;
  const failed: string[] = [];
  for (const item of manifest.items) {
    if (only && !only.has(item.id)) continue;
    const prompt = soundPrompt(item.prompt);
    for (let v = 1; v <= item.variations; v++) {
      const file = `${item.id}-${v}.mp3`;
      // The variation number goes into the hash so each variation is its own render.
      const hash = createHash('sha256').update(JSON.stringify({ model: manifest.model, prompt, v })).digest('hex').slice(0, 16);
      if (values['dry-run']) {
        console.log(`${file}: ${prompt}`);
        continue;
      }
      if (!values.force && existsSync(resolve(outDir, file)) && provenance[file]?.hash === hash) {
        console.log(`skip ${file}`);
        continue;
      }
      process.stdout.write(`gen  ${file} … `);
      // Seed Audio's moderation now and then rejects a harmless render, and some renders come back silent; one retry usually clears it.
      let bytes: Buffer | null = null;
      for (let attempt = 1; attempt <= 2 && !bytes; attempt++) {
        try {
          bytes = finishClip(await speech(apiKey, manifest.model, prompt));
        } catch (e) {
          if (attempt === 2) console.log(`FAIL (${e instanceof Error ? e.message.slice(0, 160) : String(e)})`);
        }
      }
      if (!bytes) {
        failed.push(file);
        continue;
      }
      writeFileSync(resolve(outDir, file), bytes);
      provenance[file] = { model: manifest.model, prompt, hash, date: new Date().toISOString().slice(0, 10) };
      writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
      made++;
      console.log('ok');
    }
  }
  // The client reads this list to know which variations exist.
  const index: Record<string, string[]> = {};
  for (const file of Object.keys(provenance).sort()) {
    const id = file.replace(/-\d+\.mp3$/, '');
    if (existsSync(resolve(outDir, file))) (index[id] ??= []).push(file);
  }
  writeFileSync(resolve(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  if (failed.length) console.log(`Failed (rerun to retry): ${failed.join(', ')}`);
  console.log(`Generated ${made} clip(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
