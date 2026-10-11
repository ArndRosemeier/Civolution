/**
 * The one OpenRouter transport: retries 429/5xx with backoff (honouring Retry-After),
 * a long headers timeout for image rendering, typed errors.
 * Ported and trimmed from Imager `src/llm/client.ts`.
 */
import type { z } from 'zod';
import { OpenRouterError, parseErrorEnvelope } from './errors.ts';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const BACKOFFS_MS = [2_000, 8_000, 20_000];
export const IMAGE_RENDER_TIMEOUT_MS = 5 * 60 * 1000;

export function headers(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Title': 'Civolution asset pipeline',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function request(path: string, init: RequestInit, timeoutMs = 60_000): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`no response from OpenRouter within ${timeoutMs / 1000}s`)), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${OPENROUTER_BASE}${path}`, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) return response;
    const backoff = BACKOFFS_MS[attempt];
    if ((response.status !== 429 && response.status < 500) || backoff === undefined) {
      throw new OpenRouterError('http', response.status, await response.text());
    }
    const retryAfter = Number(response.headers.get('Retry-After'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(30_000, retryAfter * 1000) : backoff);
  }
}

export async function readJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new OpenRouterError('invalid-response', response.status, 'body is not JSON');
  }
  const envelope = parseErrorEnvelope(json);
  if (envelope) throw new OpenRouterError('http', response.status, envelope.message ?? 'error body', envelope.code);
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new OpenRouterError('invalid-response', response.status, parsed.error.message);
  return parsed.data;
}
