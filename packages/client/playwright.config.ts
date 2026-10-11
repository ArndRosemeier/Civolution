import { defineConfig } from '@playwright/test';

/**
 * UI smoke tests (PLAN.md §11). Locally they use the installed Chrome (`PW_CHANNEL=chrome`);
 * CI uses Playwright's Chromium with software WebGL.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  // Software WebGL on a CI runner: one browser at a time keeps the timings steady.
  ...(process.env['CI'] ? { workers: 1 } : {}),
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1600, height: 900 },
    ...(process.env['PW_CHANNEL'] ? { channel: process.env['PW_CHANNEL'] } : {}),
    launchOptions: { args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--mute-audio'] },
  },
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
