# Importing the original rules

**Status:** verified against the Steam Civ3 Complete install · **Confidence:** high for layout, medium for some field meanings

## What is read

`pnpm run import` reads a local Civ3 Complete install (path from `CIV3_PATH`, see
`.env.example`) and writes to `data/imported/`, which is gitignored because the content is
copyrighted. Nothing from the install is committed or shipped (PLAN.md D2).

| Output | Source | Contents |
|---|---|---|
| `conquests.json` | `Conquests/conquests.biq` (BIQ 12.8) | The default rule set; validated by `ImportedRulesSchema` plus index-reference checks |
| `ptw.json` | `civ3PTW/civ3X.bix` (BIX 11.18) | Play the World rules, for comparison |
| `vanilla.json` | `civ3mod.bic` (BIC 4.1) | Original rules, for comparison |
| `text.json` | `Conquests/Text/*.txt` | Civilopedia entries (summary, description, links), PediaIcons mapping, labels, diplomacy lines |
| `report.json` | | Section counts, undecoded records, byte round-trip result, validation errors |

The import fails (non-zero exit) if any record is not fully decoded, a file does not
re-encode to identical bytes, or validation finds a problem.

## File format

Rule files are compressed with PKWARE DCL "implode" (`packages/importer/src/blast.ts`, a
port of Mark Adler's public-domain `blast.c`). Decompressed, a file is `BIC ` or `BICX`, a
`VER#` header, then sections: a 4-character tag, a record count, and length-prefixed
records. `FLAV` is the exception and has no per-record lengths.

Record layouts live in `packages/importer/src/biq/layouts.ts`. They follow the community
format documentation (Apolyton "Civilization III BIX/BIQ file format" thread) with the
differences between editions worked out against the actual files. Every layout describes
both reading and writing, so the round-trip test proves each byte is accounted for.

## Encodings to remember when curating

- Building `cost` and tech `cost` are stored in tens: Temple `6` means 60 shields.
  Unit `shieldCost` is stored in full in Conquests (Warrior `10`) but in tens in the
  vanilla file (Warrior `1`).
- `-1` means "none" for every index reference.
- Bit fields are kept as numbers and also decoded into names under `traits`; bits
  without a documented meaning appear as `bitN`.
- GOVT `relations[].canBribe` is `0xCDCDCDCD` (uninitialised memory) in the shipped file,
  so it carries no information.
- TERR `pollutionEffect` reads like the terrain a tile degrades to (Grassland → Plains →
  Desert, Marsh → Coast), but Forest and Jungle hold 14, one past the last terrain.
  Meaning still open.
- Fields named `unknownN` are kept so nothing is lost; their meaning is not yet known.
