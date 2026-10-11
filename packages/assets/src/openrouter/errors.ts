/**
 * Typed OpenRouter failures. Ported and trimmed from Imager `src/llm/errors.ts`
 * (github.com/ArndRosemeier/Imager), the basis of this pipeline's client (PLAN.md §10.3).
 */
import { z } from 'zod';

export class OpenRouterError extends Error {
  constructor(
    readonly kind: 'http' | 'invalid-response',
    readonly status: number,
    readonly bodyText: string,
    readonly code?: number | string,
  ) {
    const snippet = bodyText.length > 300 ? `${bodyText.slice(0, 300)}…` : bodyText;
    super(`OpenRouter request failed (${status})${snippet ? `: ${snippet}` : ''}`);
    this.name = 'OpenRouterError';
  }
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('OPEN_ROUTER_KEY is not set.');
    this.name = 'MissingApiKeyError';
  }
}

const envelopeSchema = z.looseObject({
  error: z
    .looseObject({
      code: z.union([z.number(), z.string()]).optional(),
      message: z.string().optional(),
      metadata: z.looseObject({ error_type: z.string().optional() }).nullish(),
    })
    .optional(),
});

export function parseErrorEnvelope(value: unknown): { code: number | string | undefined; message: string | undefined } | null {
  const parsed = envelopeSchema.safeParse(value);
  const error = parsed.success ? parsed.data.error : undefined;
  return error ? { code: error.code ?? error.metadata?.error_type, message: error.message } : null;
}
