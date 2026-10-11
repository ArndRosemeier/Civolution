/**
 * The build version and its history (src/changelog.json). Every shipped change set (a
 * phase PR or a later fix PR) adds an entry on top and raises the version by 0.001
 * (docs/PLAN.md, "Versions").
 */
import changelog from './changelog.json';

export interface Release {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const RELEASES: readonly Release[] = changelog;

/** The current version: the newest entry. */
export const VERSION = RELEASES[0]?.version ?? '0.000';
