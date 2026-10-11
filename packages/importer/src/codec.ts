/**
 * Symmetric binary codec: one description of a record layout drives both
 * decoding (bytes -> plain object) and encoding (plain object -> bytes), so the
 * round-trip property (decode then encode gives identical bytes) holds by construction
 * and can be tested against real files.
 */
import { decode1252, encode1252 } from './text1252.ts';

export type Rec = Record<string, unknown>;

/** Bytes after a string's NUL terminator that are not zero, keyed by field name. */
export const PAD_KEY = '$pad';

export interface Codec {
  readonly reading: boolean;
  i32(key: string): number;
  i16(key: string): number;
  u8(key: string): number;
  f32(key: string): number;
  /** Fixed-size, NUL-terminated Windows-1252 string. */
  str(key: string, size: number): string;
  i32s(key: string, count: number): number[];
  u8s(key: string, count: number): number[];
  strs(key: string, size: number, count: number): string[];
  /** A list of nested records, each described by `body`. */
  list(key: string, count: number, body: (c: Codec) => void): void;
  /** Everything left in the record, kept as hex so unknown data survives a round trip. */
  rest(key: string): void;
  /** Bytes left in the record (reading) or undefined while writing. */
  remaining(): number | undefined;
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function unhex(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(text, 'hex'));
}

class ReadCodec implements Codec {
  readonly reading = true;
  constructor(
    private readonly bytes: Uint8Array,
    private readonly view: DataView,
    private readonly cursor: { pos: number },
    private readonly end: number,
    readonly out: Rec,
  ) {}

  private take(n: number): number {
    const at = this.cursor.pos;
    if (at + n > this.end) {
      throw new Error(`Read of ${n} bytes at offset ${at} runs past record end ${this.end}`);
    }
    this.cursor.pos += n;
    return at;
  }

  /** Guards counts read from the file so a wrong layout fails instead of producing garbage. */
  private check(count: number, unit: number, key: string) {
    if (!Number.isInteger(count) || count < 0 || count * unit > this.end - this.cursor.pos) {
      throw new Error(`Implausible count ${count} for "${key}" at offset ${this.cursor.pos}`);
    }
  }

  private set<T>(key: string, v: T): T {
    this.out[key] = v;
    return v;
  }

  i32(key: string) {
    return this.set(key, this.view.getInt32(this.take(4), true));
  }
  i16(key: string) {
    return this.set(key, this.view.getInt16(this.take(2), true));
  }
  u8(key: string) {
    return this.set(key, this.view.getUint8(this.take(1)));
  }
  f32(key: string) {
    return this.set(key, this.view.getFloat32(this.take(4), true));
  }

  private readStr(size: number, padKey: string): string {
    const at = this.take(size);
    const raw = this.bytes.subarray(at, at + size);
    let nul = raw.indexOf(0);
    if (nul < 0) nul = size;
    const after = raw.subarray(nul);
    if (after.some((b) => b !== 0)) {
      const pad = (this.out[PAD_KEY] ??= {}) as Record<string, string>;
      pad[padKey] = hex(after);
    }
    return decode1252(raw.subarray(0, nul));
  }

  str(key: string, size: number) {
    return this.set(key, this.readStr(size, key));
  }
  i32s(key: string, count: number) {
    this.check(count, 4, key);
    const a: number[] = [];
    for (let i = 0; i < count; i++) a.push(this.view.getInt32(this.take(4), true));
    return this.set(key, a);
  }
  u8s(key: string, count: number) {
    this.check(count, 1, key);
    const a: number[] = [];
    for (let i = 0; i < count; i++) a.push(this.view.getUint8(this.take(1)));
    return this.set(key, a);
  }
  strs(key: string, size: number, count: number) {
    this.check(count, size, key);
    const a: string[] = [];
    for (let i = 0; i < count; i++) a.push(this.readStr(size, `${key}.${i}`));
    return this.set(key, a);
  }
  list(key: string, count: number, body: (c: Codec) => void) {
    this.check(count, 0, key);
    const items: Rec[] = [];
    for (let i = 0; i < count; i++) {
      const item: Rec = {};
      body(new ReadCodec(this.bytes, this.view, this.cursor, this.end, item));
      items.push(item);
    }
    this.out[key] = items;
  }
  rest(key: string) {
    const n = this.end - this.cursor.pos;
    if (n > 0) this.out[key] = hex(this.bytes.subarray(this.take(n), this.end));
  }
  remaining() {
    return this.end - this.cursor.pos;
  }
}

export class ByteWriter {
  private buf = new Uint8Array(4096);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private grow(n: number): number {
    if (this.length + n > this.buf.length) {
      const bigger = new Uint8Array(Math.max(this.buf.length * 2, this.length + n));
      bigger.set(this.buf.subarray(0, this.length));
      this.buf = bigger;
      this.view = new DataView(bigger.buffer);
    }
    const at = this.length;
    this.length += n;
    return at;
  }
  i32(v: number) {
    const at = this.grow(4);
    this.view.setInt32(at, v, true);
  }
  i16(v: number) {
    const at = this.grow(2);
    this.view.setInt16(at, v, true);
  }
  u8(v: number) {
    const at = this.grow(1);
    this.view.setUint8(at, v);
  }
  f32(v: number) {
    const at = this.grow(4);
    this.view.setFloat32(at, v, true);
  }
  bytes(b: Uint8Array) {
    const at = this.grow(b.length);
    this.buf.set(b, at);
  }
  /** Overwrites a previously written int32 (for length prefixes). */
  patchI32(at: number, v: number) {
    this.view.setInt32(at, v, true);
  }
  result(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

class WriteCodec implements Codec {
  readonly reading = false;
  constructor(
    private readonly w: ByteWriter,
    private readonly src: Rec,
  ) {}

  private get(key: string): unknown {
    if (!(key in this.src)) throw new Error(`Missing field "${key}"`);
    return this.src[key];
  }
  private num(key: string): number {
    const v = this.get(key);
    if (typeof v !== 'number') throw new Error(`Field "${key}" is not a number`);
    return v;
  }
  private arr<T>(key: string, count: number): T[] {
    const v = this.get(key);
    if (!Array.isArray(v) || v.length !== count) {
      throw new Error(`Field "${key}" must be an array of ${count}`);
    }
    return v as T[];
  }

  i32(key: string) {
    const v = this.num(key);
    this.w.i32(v);
    return v;
  }
  i16(key: string) {
    const v = this.num(key);
    this.w.i16(v);
    return v;
  }
  u8(key: string) {
    const v = this.num(key);
    this.w.u8(v);
    return v;
  }
  f32(key: string) {
    const v = this.num(key);
    this.w.f32(v);
    return v;
  }

  private writeStr(text: string, size: number, padKey: string) {
    const enc = encode1252(text);
    if (enc.length > size) throw new Error(`"${text}" does not fit in ${size} bytes`);
    const pad = (this.src[PAD_KEY] as Record<string, string> | undefined)?.[padKey];
    const field = new Uint8Array(size);
    field.set(enc.subarray(0, size));
    if (pad !== undefined) field.set(unhex(pad), enc.length);
    this.w.bytes(field);
  }

  str(key: string, size: number) {
    const v = this.get(key);
    if (typeof v !== 'string') throw new Error(`Field "${key}" is not a string`);
    this.writeStr(v, size, key);
    return v;
  }
  i32s(key: string, count: number) {
    const a = this.arr<number>(key, count);
    for (const v of a) this.w.i32(v);
    return a;
  }
  u8s(key: string, count: number) {
    const a = this.arr<number>(key, count);
    for (const v of a) this.w.u8(v);
    return a;
  }
  strs(key: string, size: number, count: number) {
    const a = this.arr<string>(key, count);
    a.forEach((s, i) => {
      this.writeStr(s, size, `${key}.${i}`);
    });
    return a;
  }
  list(key: string, count: number, body: (c: Codec) => void) {
    for (const item of this.arr<Rec>(key, count)) body(new WriteCodec(this.w, item));
  }
  rest(key: string) {
    const v = this.src[key];
    if (typeof v === 'string') this.w.bytes(unhex(v));
  }
  remaining() {
    return undefined;
  }
}

/** Decodes one record of `bytes[start, end)`; throws if the layout does not consume it exactly. */
export function decodeRecord(bytes: Uint8Array, start: number, end: number, body: (c: Codec) => void): Rec {
  const out: Rec = {};
  const cursor = { pos: start };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  body(new ReadCodec(bytes, view, cursor, end, out));
  if (cursor.pos !== end) {
    throw new Error(`Layout consumed ${cursor.pos - start} of ${end - start} bytes`);
  }
  return out;
}

export function encodeRecord(w: ByteWriter, rec: Rec, body: (c: Codec) => void): void {
  body(new WriteCodec(w, rec));
}
