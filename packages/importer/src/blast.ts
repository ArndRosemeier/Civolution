/**
 * PKWARE Data Compression Library "implode" decompressor.
 *
 * TypeScript port of Mark Adler's public-domain `blast.c` (zlib contrib).
 * Civ3 compresses its .biq/.bic/.bix rule files and saves with this format.
 */

const MAXBITS = 13;

interface Huffman {
  /** count[len] = number of symbols with code length len */
  count: Int16Array;
  /** symbols ordered by code length, then by symbol value */
  symbol: Int16Array;
}

/** Builds a canonical Huffman table from blast's compact run-length representation. */
function construct(rep: readonly number[], symbols: number): Huffman {
  const length: number[] = [];
  for (const byte of rep) {
    const len = byte & 15;
    for (let left = (byte >> 4) + 1; left > 0; left--) length.push(len);
  }
  if (length.length !== symbols) {
    throw new Error(`blast: code table expands to ${length.length} symbols, expected ${symbols}`);
  }
  const count = new Int16Array(MAXBITS + 1);
  for (const len of length) count[len]!++;
  let left = 1;
  for (let len = 1; len <= MAXBITS; len++) {
    left = (left << 1) - count[len]!;
    if (left < 0) throw new Error('blast: over-subscribed code table');
  }
  const offs = new Int16Array(MAXBITS + 1);
  for (let len = 1; len < MAXBITS; len++) offs[len + 1] = offs[len]! + count[len]!;
  const symbol = new Int16Array(symbols);
  length.forEach((len, sym) => {
    if (len !== 0) symbol[offs[len]!++] = sym;
  });
  return { count, symbol };
}

// Code tables from blast.c (fixed by the format).
const LITLEN = [
  11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8, 9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12, 11,
  7, 9, 11, 12, 6, 7, 22, 5, 7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11, 8, 11, 9, 12, 8, 12, 5, 38, 5, 38,
  5, 11, 7, 5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27, 44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12, 45, 12, 61, 12,
  45, 44, 173,
];
const LENLEN = [2, 35, 36, 53, 38, 23];
const DISTLEN = [2, 20, 53, 230, 247, 151, 248];
const BASE = [3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264];
const EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8];

let tables: { lit: Huffman; len: Huffman; dist: Huffman } | undefined;
function getTables() {
  tables ??= { lit: construct(LITLEN, 256), len: construct(LENLEN, 16), dist: construct(DISTLEN, 64) };
  return tables;
}

/** Returns true if `data` starts like a PKWARE DCL stream (literal mode 0/1, dictionary 4–6). */
export function looksImploded(data: Uint8Array): boolean {
  return data.length >= 2 && data[0]! <= 1 && data[1]! >= 4 && data[1]! <= 6;
}

export function blast(input: Uint8Array): Uint8Array {
  const { lit: litcode, len: lencode, dist: distcode } = getTables();
  let pos = 0;
  let bitbuf = 0;
  let bitcnt = 0;

  const bits = (need: number): number => {
    while (bitcnt < need) {
      if (pos >= input.length) throw new Error('blast: unexpected end of input');
      bitbuf |= input[pos++]! << bitcnt;
      bitcnt += 8;
    }
    const val = bitbuf & ((1 << need) - 1);
    bitbuf >>>= need;
    bitcnt -= need;
    return val;
  };

  // Codes are stored bit-reversed and inverted; decode one bit at a time.
  const decode = (h: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= MAXBITS; len++) {
      code |= bits(1) ^ 1;
      const count = h.count[len]!;
      if (code - first < count) return h.symbol[index + (code - first)]!;
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('blast: invalid Huffman code');
  };

  const lit = bits(8);
  if (lit > 1) throw new Error(`blast: bad literal flag ${lit}`);
  const dict = bits(8);
  if (dict < 4 || dict > 6) throw new Error(`blast: bad dictionary size ${dict}`);

  let out = new Uint8Array(Math.max(1024, input.length * 8));
  let n = 0;
  const ensure = (extra: number) => {
    if (n + extra <= out.length) return;
    const bigger = new Uint8Array(Math.max(out.length * 2, n + extra));
    bigger.set(out.subarray(0, n));
    out = bigger;
  };

  for (;;) {
    if (bits(1)) {
      const lsym = decode(lencode);
      const len = BASE[lsym]! + bits(EXTRA[lsym]!);
      if (len === 519) break; // end of stream
      const shift = len === 2 ? 2 : dict;
      let dist = decode(distcode) << shift;
      dist += bits(shift);
      dist++;
      if (dist > n) throw new Error('blast: distance too far back');
      ensure(len);
      for (let i = 0; i < len; i++) {
        out[n] = out[n - dist]!;
        n++;
      }
    } else {
      ensure(1);
      out[n++] = lit ? decode(litcode) : bits(8);
    }
  }
  return out.slice(0, n);
}
