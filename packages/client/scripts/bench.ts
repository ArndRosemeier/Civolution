/**
 * Runs the map benchmark (?bench) in a real, visible Chrome window on this machine's
 * GPU and prints the result. Needs the dev server: `pnpm dev` in another terminal.
 *   pnpm --filter @civolution/client bench -- --size huge --units 500 --width 1920 --height 1080
 */
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5173/' },
    size: { type: 'string', default: 'huge' },
    units: { type: 'string', default: '500' },
    width: { type: 'string', default: '1920' },
    height: { type: 'string', default: '1080' },
    channel: { type: 'string', default: 'chrome' },
  },
});

const browser = await chromium.launch({
  channel: values.channel,
  headless: false,
  args: ['--disable-frame-rate-limit=false', '--ignore-gpu-blocklist', `--window-size=${values.width},${Number(values.height) + 120}`],
});
const page = await browser.newPage({ viewport: { width: Number(values.width), height: Number(values.height) } });
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await page.goto(`${values.url}?bench&size=${values.size}&units=${values.units}`);
await page.waitForFunction(() => (window as unknown as { __bench?: unknown }).__bench !== undefined, null, { timeout: 120_000 });
const result = await page.evaluate(() => (window as unknown as { __bench: unknown }).__bench);
console.log(JSON.stringify(result, null, 2));
// Screenshots at each zoom level for a visual check.
for (const [name, distance] of [['close', 8], ['mid', 26], ['far', 80]] as const) {
  await page.evaluate((d) => {
    const v = (window as unknown as { __view: { setView(v: object, i: boolean): void } }).__view;
    v.setView({ distance: d }, true);
  }, distance);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `bench-${name}.png` });
}
await browser.close();
