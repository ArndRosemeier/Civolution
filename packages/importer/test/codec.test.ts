import { describe, expect, it } from 'vitest';
import { ByteWriter, decodeRecord, encodeRecord, PAD_KEY, type Codec } from '../src/codec.ts';

const layout = (c: Codec) => {
  c.i32('id');
  c.str('name', 8);
  const n = c.i32('count');
  c.list('items', n, (i) => {
    i.i16('a');
    i.u8('b');
  });
  c.f32('ratio');
  c.rest('tail');
};

function bytesOf(build: (w: ByteWriter) => void): Uint8Array {
  const w = new ByteWriter();
  build(w);
  return w.result();
}

describe('codec', () => {
  const sample = bytesOf((w) => {
    w.i32(-7);
    w.bytes(Uint8Array.of(0x48, 0x69, 0x00, 0xcd, 0xcd, 0x00, 0x00, 0x00)); // "Hi" + garbage after NUL
    w.i32(2);
    w.i16(300);
    w.u8(1);
    w.i16(-2);
    w.u8(255);
    w.f32(0.5);
    w.bytes(Uint8Array.of(9, 9));
  });

  it('decodes fields, keeps padding garbage and unknown tails', () => {
    const rec = decodeRecord(sample, 0, sample.length, layout);
    expect(rec).toMatchObject({ id: -7, name: 'Hi', count: 2, ratio: 0.5, tail: '0909' });
    expect(rec['items']).toEqual([
      { a: 300, b: 1 },
      { a: -2, b: 255 },
    ]);
    expect(rec[PAD_KEY]).toEqual({ name: '00cdcd000000' });
  });

  it('round-trips to identical bytes', () => {
    const rec = decodeRecord(sample, 0, sample.length, layout);
    const w = new ByteWriter();
    encodeRecord(w, rec, layout);
    expect(Buffer.from(w.result()).equals(Buffer.from(sample))).toBe(true);
  });

  it('fails when a layout reads past the record', () => {
    expect(() => decodeRecord(sample, 0, 10, layout)).toThrow(/past record end/);
  });

  it('rejects implausible counts instead of producing garbage', () => {
    const bad = bytesOf((w) => {
      w.i32(1);
      w.bytes(new Uint8Array(8));
      w.i32(-1);
    });
    expect(() => decodeRecord(bad, 0, bad.length, layout)).toThrow(/Implausible count/);
  });
});
