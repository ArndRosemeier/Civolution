import { expect, test } from '@playwright/test';

test('new game, found a city, run it, end turns, save and load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: /^Tiny/ }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  const turn = page.locator('.top-bar .stat strong').filter({ hasText: /^Turn / });
  await expect(turn).toHaveText('Turn 1');
  await expect(page.locator('.loading')).toHaveCount(0, { timeout: 30_000 });

  // The first unit awaiting orders is selected: found a city, automate the worker, explore.
  const panel = page.locator('.unit-panel');
  await expect(panel.locator('h3')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const name = await panel.locator('h3').textContent();
    if (name === 'Settler') await page.keyboard.press('KeyB');
    else if (name === 'Worker') await page.keyboard.press('KeyA');
    else await page.keyboard.press('KeyX');
    await page.waitForTimeout(250);
  }
  await expect(page.locator('.city-label')).toHaveCount(1);

  // The city screen: pick a build from the list.
  await page.locator('.city-label').click();
  const city = page.locator('.city-screen');
  await expect(city).toBeVisible();
  await city.locator('.build-options button').filter({ hasText: 'Worker' }).click();
  await expect(city.locator('.current-build')).toContainText('Worker');
  await page.keyboard.press('Escape');

  // Research: the science advisor lists what can be learned now.
  await page.keyboard.press('F6');
  await page.locator('button.tech.open').first().click();
  await expect(page.locator('.top-bar .research')).not.toContainText('Choose research');

  await page.getByRole('button', { name: /End turn/ }).click();
  await expect(turn).toHaveText('Turn 2');
  await page.keyboard.press('Enter');
  await expect(turn).toHaveText('Turn 3');

  // The domestic advisor lists the city.
  await page.keyboard.press('F1');
  await expect(page.locator('.city-table tbody tr')).toHaveCount(1);
  await page.keyboard.press('Escape');

  // Save, play on, load back.
  await page.keyboard.press('Control+KeyS');
  await page.getByLabel('Save name').fill('smoke');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(turn).toHaveText('Turn 4');
  await page.keyboard.press('Control+KeyL');
  await page.getByRole('button', { name: /^smoke/ }).click();
  await expect(turn).toHaveText('Turn 3');
  await expect(page.locator('.city-label')).toHaveCount(1);

  await page.screenshot({ path: 'test-results/smoke.png' });
  expect(errors).toEqual([]);
});
