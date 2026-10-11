/**
 * Image generation through OpenRouter's Images API (`POST /images`) with optional
 * reference images, and per-model limits from the live `GET /images/models` list:
 * counts and aspect ratios come from the API, never from guesses.
 * Ported and trimmed from Imager `src/llm/images.ts` and `src/llm/imageModels.ts`.
 */
import { z } from 'zod';
import { headers, IMAGE_RENDER_TIMEOUT_MS, readJson, request } from './client.ts';
import { MissingApiKeyError, OpenRouterError } from './errors.ts';

const descriptor = z.union([
  z.looseObject({ type: z.literal('range'), min: z.number(), max: z.number() }),
  z.looseObject({ type: z.literal('enum'), values: z.array(z.string()) }),
  z.looseObject({ type: z.string() }),
]);
const modelsSchema = z.looseObject({
  data: z.array(z.looseObject({ id: z.string(), supported_parameters: z.record(z.string(), descriptor) })),
});

export interface ImageModelLimits {
  maxCount: number;
  aspectRatios: string[];
  maxReferences: number;
}

export async function imageModels(apiKey: string): Promise<Map<string, ImageModelLimits>> {
  const response = await request('/images/models', { headers: headers(apiKey) });
  const { data } = await readJson(response, modelsSchema);
  return new Map(
    data.map((m) => {
      const p = m.supported_parameters;
      const n = p['n'];
      const ar = p['aspect_ratio'];
      const refs = p['input_references'];
      const limits: ImageModelLimits = {
        maxCount: n && 'max' in n && typeof n.max === 'number' ? Math.max(1, n.max) : 1,
        aspectRatios: ar && 'values' in ar && Array.isArray(ar.values) ? (ar.values as string[]) : [],
        maxReferences: refs && 'max' in refs && typeof refs.max === 'number' ? refs.max : 0,
      };
      return [m.id, limits] as const;
    }),
  );
}

const imagesSchema = z.looseObject({
  data: z.array(z.looseObject({ b64_json: z.string().optional(), media_type: z.string().optional() }).nullable()).optional(),
  usage: z.looseObject({ cost: z.number().optional() }).optional(),
});

export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
}

export async function generateImages(req: {
  apiKey: string;
  model: string;
  prompt: string;
  n: number;
  aspectRatio?: string | undefined;
  /** data: URLs of reference images (e.g. the style bible). */
  references?: string[];
}): Promise<{ images: GeneratedImage[]; costUsd: number | null }> {
  if (!req.apiKey) throw new MissingApiKeyError();
  const response = await request(
    '/images',
    {
      method: 'POST',
      headers: headers(req.apiKey),
      body: JSON.stringify({
        model: req.model,
        prompt: req.prompt,
        n: req.n,
        ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
        ...(req.references?.length ? { input_references: req.references.map((url) => ({ type: 'image_url', image_url: { url } })) } : {}),
      }),
    },
    IMAGE_RENDER_TIMEOUT_MS,
  );
  const body = await readJson(response, imagesSchema);
  const images = (body.data ?? []).flatMap((e) => {
    if (!e?.b64_json) return [];
    if (!e.media_type) throw new OpenRouterError('invalid-response', response.status, 'image without media_type');
    return [{ bytes: Buffer.from(e.b64_json, 'base64'), mimeType: e.media_type }];
  });
  if (images.length === 0) throw new OpenRouterError('invalid-response', response.status, 'no images returned (all filtered?)');
  return { images, costUsd: body.usage?.cost ?? null };
}
