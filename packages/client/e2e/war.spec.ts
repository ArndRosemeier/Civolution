import { expect, test } from '@playwright/test';

type Civ = { store: { getState(): { snapshot: { state: { units: Record<string, { id: number; owner: number; type: string; tile: number }> }; human: number; visible: Uint8Array }; send(c: object): Promise<boolean>; select(id: number): void } } };

test('version history, then a skirmish: odds, an attack, the war room and diplomacy', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scenario=skirmish');
  await expect(page.locator('.version-tag')).toContainText('Alpha 0.');
  await page.getByRole('button', { name: 'What’s new' }).click();
  await expect(page.locator('.whats-new section').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: /^Tiny/ }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.loading')).toHaveCount(0, { timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as { __civ?: unknown }).__civ !== undefined, null, { timeout: 60_000 });
  await expect(page.locator('.top-bar')).toContainText('At war with');

  // The veteran archer attacks a neighbouring foe through the same command as a click.
  const result = await page.evaluate(async () => {
    const st = (window as unknown as { __civ: Civ }).__civ.store.getState();
    const s = st.snapshot.state;
    const me = st.snapshot.human;
    const archer = Object.values(s.units).find((u) => u.owner === me && u.type === 'archer')!;
    const foe = Object.values(s.units).find((u) => u.owner !== me && st.snapshot.visible[u.tile] === 1 && u.type === 'warrior')!;
    st.select(archer.id);
    return st.send({ type: 'moveUnit', unit: archer.id, to: foe.tile });
  });
  expect(result).toBe(true);
  await expect(page.locator('.log-panel')).toContainText(/Victory|Defeat|withdrew/);

  await page.keyboard.press('F3');
  await expect(page.getByRole('dialog', { name: 'War room' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('At war');
  await page.keyboard.press('Escape');

  // Diplomacy: the enemy leader, their mood, and a peace offer they may refuse.
  await page.keyboard.press('F4');
  const dip = page.getByRole('dialog', { name: 'Diplomacy' });
  await expect(dip).toBeVisible();
  await expect(dip.locator('.badge.rel-war')).toContainText('At war');
  await dip.getByLabel('Add an item').first().selectOption({ label: 'peace treaty' });
  await dip.getByRole('button', { name: 'Propose' }).click();
  await expect(dip.locator('.leader-reply')).toBeVisible();
  await page.screenshot({ path: 'test-results/diplomacy.png' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await expect(page.locator('.top-bar .stat strong').filter({ hasText: /^Turn / })).toHaveText('Turn 2', { timeout: 60_000 });
  await page.screenshot({ path: 'test-results/war.png' });
  expect(errors).toEqual([]);
});
