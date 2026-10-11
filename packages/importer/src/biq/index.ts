/**
 * Reader and writer for Civ3 rule files: vanilla .bic, Play the World .bix and
 * Conquests .biq. A file is "BIC " or "BICX" followed by tagged sections; every
 * section is `tag, count` and then `count` length-prefixed records, except FLAV
 * whose body is not length-prefixed.
 */
import { blast, looksImploded } from '../blast.ts';
import { ByteWriter, decodeRecord, encodeRecord, type Rec } from '../codec.ts';
import { decode1252 } from '../text1252.ts';
import { FLAV, header, LAYOUTS, type Edition, type LayoutContext } from './layouts.ts';

export type { Edition } from './layouts.ts';

export interface BiqSection {
  tag: string;
  /** Decoded records. A record we could not decode is `{ raw: hex, error }`. */
  records: Rec[];
}

export interface BiqFile {
  magic: string;
  edition: Edition;
  header: Rec;
  sections: BiqSection[];
}

const TERRAIN_COUNT: Record<Edition, number> = { vanilla: 12, ptw: 12, conquests: 14 };

function editionOf(magic: string, major: number): Edition {
  if (magic === 'BIC ') return 'vanilla';
  return major >= 12 ? 'conquests' : 'ptw';
}

/** Decompresses if needed and parses a rule file. */
export function readBiq(file: Uint8Array): BiqFile {
  const bytes = looksImploded(file) ? blast(file) : file;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tagAt = (at: number) => decode1252(bytes.subarray(at, at + 4));
  const i32 = (at: number) => view.getInt32(at, true);

  const magic = tagAt(0);
  if (magic !== 'BIC ' && magic !== 'BICX') throw new Error(`Not a Civ3 rule file (magic "${magic}")`);
  if (tagAt(4) !== 'VER#' || i32(8) !== 1) throw new Error('Missing VER# header');
  const headerLen = i32(12);
  const ctx: LayoutContext = { edition: 'conquests', eras: 4, terrains: 14 };
  const head = decodeRecord(bytes, 16, 16 + headerLen, (c) => header(c, ctx));
  const edition = editionOf(magic, head['majorVersion'] as number);
  ctx.edition = edition;
  ctx.terrains = TERRAIN_COUNT[edition];

  const sections: BiqSection[] = [];
  let pos = 16 + headerLen;
  while (pos < bytes.length) {
    const tag = tagAt(pos);
    const count = i32(pos + 4);
    pos += 8;
    if (tag === 'FLAV') {
      // Walk the body to find its end, then decode it as one record.
      let end = pos;
      const groups = count;
      for (let g = 0; g < groups; g++) {
        const flavors = i32(end);
        end += 4;
        for (let f = 0; f < flavors; f++) end += 4 + 256 + 4 + 4 * i32(end + 260);
      }
      const body = decodeRecord(bytes, pos - 4, end, (c) => FLAV(c, ctx));
      sections.push({ tag, records: [body] });
      pos = end;
      continue;
    }
    const layout = LAYOUTS[tag];
    const records: Rec[] = [];
    for (let i = 0; i < count; i++) {
      const len = i32(pos);
      const start = pos + 4;
      const end = start + len;
      if (end > bytes.length) throw new Error(`${tag} record ${i} runs past end of file`);
      if (layout) {
        try {
          records.push(decodeRecord(bytes, start, end, (c) => layout(c, ctx)));
        } catch (e) {
          records.push({ raw: Buffer.from(bytes.subarray(start, end)).toString('hex'), error: String(e) });
        }
      } else {
        records.push({ raw: Buffer.from(bytes.subarray(start, end)).toString('hex') });
      }
      if (tag === 'ERAS') ctx.eras = count;
      pos = end;
    }
    sections.push({ tag, records });
  }
  return { magic, edition, header: head, sections };
}

/** Serialises a parsed rule file back to uncompressed bytes. */
export function writeBiq(biq: BiqFile): Uint8Array {
  const ctx: LayoutContext = { edition: biq.edition, eras: 4, terrains: TERRAIN_COUNT[biq.edition] };
  const w = new ByteWriter();
  const tag = (t: string) => {
    for (let i = 0; i < 4; i++) w.u8(t.charCodeAt(i));
  };
  const record = (write: () => void) => {
    const at = w.length;
    w.i32(0);
    write();
    w.patchI32(at, w.length - at - 4);
  };

  tag(biq.magic);
  tag('VER#');
  w.i32(1);
  record(() => encodeRecord(w, biq.header, (c) => header(c, ctx)));
  for (const section of biq.sections) {
    tag(section.tag);
    if (section.tag === 'FLAV') {
      encodeRecord(w, section.records[0]!, (c) => FLAV(c, ctx));
      continue;
    }
    w.i32(section.records.length);
    if (section.tag === 'ERAS') ctx.eras = section.records.length;
    const layout = LAYOUTS[section.tag];
    for (const rec of section.records) {
      record(() => {
        if (typeof rec['raw'] === 'string') w.bytes(Uint8Array.from(Buffer.from(rec['raw'], 'hex')));
        else if (layout) encodeRecord(w, rec, (c) => layout(c, ctx));
        else throw new Error(`No layout for ${section.tag}`);
      });
    }
  }
  return w.result();
}

/** Records of one section, or an empty list. */
export function section(biq: BiqFile, tag: string): Rec[] {
  return biq.sections.find((s) => s.tag === tag)?.records ?? [];
}
