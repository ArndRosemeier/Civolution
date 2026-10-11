import { expect, test } from '@playwright/test';

type Civ = {
  store: {
    getState(): {
      snapshot: { state: { turn: number; units: Record<string, { owner: number; movesLeft: number; order: unknown; routine: string | null }>; cities: Record<string, { id: number; owner: number }> }; human: number };
      digest: { needsInput: boolean }[];
    };
  };
};

test('a 200-city empire handed to automation: delegation, governors, the digest, the city card', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scenario=empire');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: /^Tiny/ }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.loading')).toHaveCount(0, { timeout: 90_000 });
  await page.waitForFunction(() => (window as unknown as { __civ?: unknown }).__civ !== undefined, null, { timeout: 90_000 });
  await expect(page.locator('.top-bar')).toContainText('200');

  // Delegate everything from the automation screen (F7).
  await page.keyboard.press('F7');
  const screen = page.getByRole('dialog', { name: 'Automation' });
  await expect(screen).toBeVisible();
  await screen.getByRole('button', { name: /Delegate everything/ }).click();
  await expect(screen.locator('.aspect.on')).toHaveCount(7);
  await page.screenshot({ path: 'test-results/automation-delegation.png' });
  await screen.getByRole('button', { name: 'Governors' }).click();
  await expect(screen.locator('.city-table tbody tr').first()).toContainText('food');
  await screen.getByRole('button', { name: 'Workers' }).click();
  await expect(screen.getByText(/at work or on the way/)).toBeVisible();
  await page.screenshot({ path: 'test-results/automation-workers.png' });
  await screen.getByRole('button', { name: 'Your rules' }).click();
  await screen.getByRole('button', { name: '+ New rule' }).click();
  await screen.getByRole('button', { name: 'Save rule' }).click();
  await expect(screen.locator('.rules li')).toHaveCount(1);
  await screen.getByRole('button', { name: 'Export rules and templates' }).click();
  await expect(screen.getByRole('textbox', { name: 'Rules file' })).toHaveValue(/civolution-routines/);
  await page.keyboard.press('Escape');

  // Every unit has something to do; end the turn and read the digest.
  const idle = await page.evaluate(() => {
    const st = (window as unknown as { __civ: Civ }).__civ.store.getState();
    return Object.values(st.snapshot.state.units).filter((u) => u.owner === st.snapshot.human && u.movesLeft > 0 && u.order === null && u.routine === null).length;
  });
  expect(idle).toBeLessThan(5);
  await page.getByRole('button', { name: /End turn/ }).click();
  await expect(page.locator('.top-bar .stat strong').filter({ hasText: /^Turn / })).toHaveText('Turn 2', { timeout: 60_000 });
  if ((await page.locator('.turn-digest').count()) === 0) await page.keyboard.press('F9');
  await expect(page.locator('.turn-digest')).toBeVisible();
  await expect(page.locator('.turn-digest')).toContainText('Automation:');
  const needs = await page.evaluate(() => (window as unknown as { __civ: Civ }).__civ.store.getState().digest.filter((d) => d.needsInput).length);
  expect(needs).toBeLessThan(10);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/automation-digest.png' });

  // The city screen shows the governor and template; a hand-placed citizen pauses the governor.
  const city = await page.evaluate(() => {
    const st = (window as unknown as { __civ: Civ }).__civ.store.getState();
    return Object.values(st.snapshot.state.cities).find((c) => c.owner === st.snapshot.human)!.id;
  });
  await page.evaluate((id) => (window as unknown as { __civ: { store: { getState(): { open(p: object): void } } } }).__civ.store.getState().open({ kind: 'city', id }), city);
  const card = page.locator('.city-automation');
  await expect(card).toBeVisible();
  await expect(card.getByLabel('Governor')).toHaveValue('default');
  await page.locator('.city-screen .tile-map .tile.worked.clickable').first().click();
  await expect(card).toContainText('Paused');
  await card.getByRole('button', { name: 'Resume' }).click();
  await expect(card).not.toContainText('Paused');
  await page.screenshot({ path: 'test-results/automation-city.png' });
  expect(errors).toEqual([]);
});
