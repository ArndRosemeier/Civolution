import { expect, test } from '@playwright/test';

type Unit = { id: number; owner: number; tile: number; order: { type: string; target?: number } | null };
type Civ = {
  view: { pick(x: number, y: number): number };
  store: { getState(): { selected: number | null; snapshot: { state: { units: Record<string, Unit>; cities: Record<string, { tile: number }> }; human: number } } };
};

test('a left click on an empty tile sends the selected unit there', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scenario=plain');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: /^Tiny/ }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.loading')).toHaveCount(0, { timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as { __civ?: unknown }).__civ !== undefined, null, { timeout: 60_000 });
  await expect(page.locator('.unit-panel h3')).toBeVisible();

  // Screen points around the map centre that show an empty tile two or more steps from the unit.
  const targets = await page.evaluate(() => {
    const civ = (window as unknown as { __civ: Civ }).__civ;
    const st = civ.store.getState();
    const s = st.snapshot.state;
    const unit = s.units[st.selected!]!;
    const used = new Set([...Object.values(s.units).map((u) => u.tile), ...Object.values(s.cities).map((c) => c.tile)]);
    const out: { x: number; y: number; tile: number }[] = [];
    const seen = new Set<number>();
    for (let r = 120; r <= 260 && out.length < 12; r += 35) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(800 + r * Math.cos((a * Math.PI) / 4));
        const y = Math.round(450 + r * Math.sin((a * Math.PI) / 4));
        const tile = civ.view.pick(x, y);
        if (tile < 0 || tile === unit.tile || used.has(tile) || seen.has(tile)) continue;
        seen.add(tile);
        out.push({ x, y, tile });
      }
    }
    return { unit: unit.id, start: unit.tile, out };
  });
  expect(targets.out.length).toBeGreaterThan(0);

  // Water or unexplored tiles refuse the order; try until a land tile takes it.
  let ok = false;
  for (const t of targets.out) {
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(300);
    ok = await page.evaluate(({ id, start, tile }) => {
      const u = (window as unknown as { __civ: Civ }).__civ.store.getState().snapshot.state.units[id];
      return !!u && (u.tile !== start || (u.order?.type === 'goto' && u.order.target === tile));
    }, { id: targets.unit, start: targets.start, tile: t.tile });
    if (ok) break;
  }
  expect(ok).toBe(true);
  expect(errors).toEqual([]);
});
