# Civolution

Civilization III Complete (Conquests rules) rebuilt as a single-player TypeScript web app with a modern 3D map, a polished UI and first-class player automation.

The plan lives in [docs/PLAN.md](docs/PLAN.md); rule notes in [docs/rules](docs/rules/README.md).

## Setup

Requires Node 24 and pnpm 11.

```bash
pnpm install
pnpm check          # typecheck, lint, tests
```

## Importing the original rules

The game's rule numbers are read from your own Civ3 Complete install. Copy `.env.example`
to `.env` and point `CIV3_PATH` at the install, then:

```bash
pnpm run import
```

This writes `data/imported/*.json`, which is gitignored: original game files and their
contents are never committed. See [docs/rules/importing.md](docs/rules/importing.md).

## Packages

| Package | Purpose |
|---|---|
| `packages/importer` | BIQ/BIX/BIC decompressor and parser, Civilopedia and text parsers, `pnpm run import` |
| `packages/data-schema` | Zod schemas and types for the imported data (and later the curated rule set) |
