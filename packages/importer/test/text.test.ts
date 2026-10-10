import { describe, expect, it } from 'vitest';
import { joinPediaLines, parseCivilopedia, parseDiplomacy, parseKeyedText, parseLabels } from '../src/text.ts';

// Synthetic samples in the files' format; no original text.
const PEDIA = `; comment
#GAME_CONCEPTS_KEYS
GCON_Sample

#GCON_Sample
Sample Concept
^
^The [sample] links to $LINK<the thing=PRTO_Thing>.
^{Heading}
second paragraph that wraps
onto the next line.
#PRTO_Thing
^A short summary.
#DESC_PRTO_Thing
^A longer text.
`;

describe('keyed text files', () => {
  it('splits blocks and drops comments', () => {
    const blocks = parseKeyedText(PEDIA);
    expect(blocks.map((b) => b.key)).toEqual(['GAME_CONCEPTS_KEYS', 'GCON_Sample', 'PRTO_Thing', 'DESC_PRTO_Thing']);
  });

  it('joins soft-wrapped lines and ^ breaks', () => {
    expect(joinPediaLines(['^One', 'two', 'three', '^Four'])).toBe('One two three\nFour');
  });

  it('parses Civilopedia entries with names, links and descriptions', () => {
    const pedia = parseCivilopedia(PEDIA);
    expect(pedia['GCON_Sample']?.name).toBe('Sample Concept');
    expect(pedia['GCON_Sample']?.summary?.links).toEqual([{ text: 'the thing', key: 'PRTO_Thing' }]);
    expect(pedia['GCON_Sample']?.summary?.plain).toBe(
      'The sample links to the thing.\nHeading second paragraph that wraps onto the next line.',
    );
    expect(pedia['PRTO_Thing']?.summary?.plain).toBe('A short summary.');
    expect(pedia['PRTO_Thing']?.description?.plain).toBe('A longer text.');
    expect(pedia['GAME_CONCEPTS_KEYS']).toBeUndefined();
  });

  it('parses labels and diplomacy blocks', () => {
    expect(parseLabels('#LABELS\nOne\nTwo\n')).toEqual(['One', 'Two']);
    const dip = parseDiplomacy('#GREETING\n#civ 1\n#mood -1\n"Hello $AI0."\n"Hi."\n#OTHER\n"X"\n');
    expect(dip).toEqual([
      { key: 'GREETING', attributes: { civ: 1, mood: -1 }, lines: ['Hello $AI0.', 'Hi.'] },
      { key: 'OTHER', attributes: {}, lines: ['X'] },
    ]);
  });
});
