/** Windows-1252 text, the code page of Civ3's data and text files. */

const decoder = new TextDecoder('windows-1252');
const encodeMap = new Map<string, number>();
for (let b = 0; b < 256; b++) {
  const ch = decoder.decode(Uint8Array.of(b));
  if (!encodeMap.has(ch)) encodeMap.set(ch, b);
}

export function decode1252(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function encode1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  let i = 0;
  for (const ch of text) {
    const b = encodeMap.get(ch);
    if (b === undefined) throw new Error(`Character ${JSON.stringify(ch)} has no Windows-1252 encoding`);
    out[i++] = b;
  }
  return out.subarray(0, i);
}
