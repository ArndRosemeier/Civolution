import { describe, expect, it } from 'vitest';
import { blast, looksImploded } from '../src/blast.ts';

describe('blast (PKWARE DCL implode)', () => {
  it('decodes the reference vector from blast.c', () => {
    const input = Uint8Array.of(0x00, 0x04, 0x82, 0x24, 0x25, 0x8f, 0x80, 0x7f);
    expect(Buffer.from(blast(input)).toString('latin1')).toBe('AIAIAIAIAIAIA');
  });

  it('recognises the stream header', () => {
    expect(looksImploded(Uint8Array.of(0x00, 0x06))).toBe(true);
    expect(looksImploded(Uint8Array.of(0x42, 0x49))).toBe(false);
  });

  it('rejects truncated input', () => {
    expect(() => blast(Uint8Array.of(0x00, 0x04, 0x82))).toThrow(/end of input/);
  });

  it('rejects a bad dictionary size', () => {
    expect(() => blast(Uint8Array.of(0x00, 0x09, 0x00))).toThrow(/dictionary/);
  });
});
