/**
 * Parsers for Civ3's keyed text files (Civilopedia.txt, PediaIcons.txt,
 * labels.txt, diplomacy.txt). All share one shape: `;` starts a comment line,
 * `#KEY` starts a block, and the block's lines follow.
 */

export interface TextBlock {
  key: string;
  lines: string[];
}

/** Splits a keyed text file into blocks, dropping comments and blank edge lines. */
export function parseKeyedText(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let current: TextBlock | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.startsWith(';')) continue;
    if (rawLine.startsWith('#')) {
      current = { key: rawLine.slice(1).trim(), lines: [] };
      blocks.push(current);
      continue;
    }
    current?.lines.push(rawLine.replace(/\s+$/, ''));
  }
  for (const b of blocks) {
    while (b.lines.length > 0 && b.lines[b.lines.length - 1] === '') b.lines.pop();
  }
  return blocks;
}

export interface PediaLink {
  text: string;
  key: string;
}

export interface PediaText {
  /** Text with markup kept: `[x]` emphasis, `{x}` headings, `$LINK<text=KEY>` links, `\n` line breaks. */
  markup: string;
  /** Readable text with links and emphasis resolved. */
  plain: string;
  links: PediaLink[];
}

const LINK = /\$LINK<([^=>]*)=([^>]*)>/g;

/**
 * Joins Civilopedia body lines. A leading `^` starts a new line; other lines are
 * soft-wrapped continuations of the previous one.
 */
export function joinPediaLines(lines: readonly string[]): string {
  let out = '';
  lines.forEach((line, i) => {
    if (line.startsWith('^')) {
      out += (i === 0 ? '' : '\n') + line.slice(1);
    } else if (line === '') {
      out += '\n';
    } else {
      out += out === '' || out.endsWith('\n') || out.endsWith(' ') ? line : ` ${line}`;
    }
  });
  return out.trim();
}

export function pediaText(markup: string): PediaText {
  const links: PediaLink[] = [];
  for (const m of markup.matchAll(LINK)) links.push({ text: m[1]!, key: m[2]!.trim() });
  const plain = markup
    .replace(LINK, (_, t: string) => t)
    .replace(/\[([^\]]*)\]/g, '$1')
    .replace(/\{([^}]*)\}/g, '$1');
  return { markup, plain, links };
}

export interface PediaEntry {
  key: string;
  /** Display name; only game concepts (GCON_) carry one in the file. */
  name?: string;
  summary?: PediaText;
  description?: PediaText;
}

/**
 * Parses Civilopedia.txt into entries keyed by their Civilopedia key
 * (e.g. PRTO_Warrior). `#KEY` blocks hold the summary, `#DESC_KEY` the long text.
 */
export function parseCivilopedia(text: string): Record<string, PediaEntry> {
  const entries: Record<string, PediaEntry> = {};
  const entry = (key: string) => (entries[key] ??= { key });
  for (const block of parseKeyedText(text)) {
    if (block.key === 'GAME_CONCEPTS_KEYS' || block.key === 'GAME_CONCEPTS') continue;
    if (block.key.startsWith('DESC_')) {
      entry(block.key.slice(5)).description = pediaText(joinPediaLines(block.lines));
      continue;
    }
    const e = entry(block.key);
    let lines = block.lines;
    if (block.key.startsWith('GCON_') && lines.length > 0 && !lines[0]!.startsWith('^')) {
      e.name = lines[0]!;
      lines = lines.slice(1);
    }
    e.summary = pediaText(joinPediaLines(lines));
  }
  return entries;
}

/** PediaIcons.txt: icon key -> list of art file paths (art itself is never imported). */
export function parsePediaIcons(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const b of parseKeyedText(text)) out[b.key] = b.lines.filter((l) => l.trim() !== '');
  return out;
}

/** labels.txt: the `#LABELS` block as an indexed list. */
export function parseLabels(text: string): string[] {
  return parseKeyedText(text).find((b) => b.key === 'LABELS')?.lines ?? [];
}

export interface DiplomacyBlock {
  key: string;
  /** Selectors such as civ, power, mood, random. */
  attributes: Record<string, number>;
  lines: string[];
}

/**
 * diplomacy.txt: a `#KEY` line followed by `#name value` attribute lines and
 * quoted message lines.
 */
export function parseDiplomacy(text: string): DiplomacyBlock[] {
  const out: DiplomacyBlock[] = [];
  let current: DiplomacyBlock | undefined;
  for (const b of parseKeyedText(text)) {
    const attr = /^([a-z]+)\s+(-?\d+)$/.exec(b.key);
    if (attr && current) {
      current.attributes[attr[1]!] = Number(attr[2]);
      current.lines.push(...b.lines.filter((l) => l.trim() !== ''));
      continue;
    }
    current = { key: b.key, attributes: {}, lines: b.lines.filter((l) => l.trim() !== '') };
    out.push(current);
  }
  return out.map((d) => ({ ...d, lines: d.lines.map((l) => l.replace(/^"(.*)"$/, '$1')) }));
}
