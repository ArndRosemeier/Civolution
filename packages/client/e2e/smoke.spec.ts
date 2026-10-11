import { expect, test } from '@playwright/test';

test('new game, give orders, end turns, save and load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: /^Tiny/ }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  const turn = page.locator('.top-bar .stat').filter({ hasText: 'Turn' }).locator('strong');
  await expect(turn).toHaveText('1');
  await expect(page.locator('.loading')).toHaveCount(0, { timeout: 30_000 });

  // The first unit awaiting orders is selected; send every land unit exploring or working.
  const panel = page.locator('.unit-panel');
  await expect(panel.locator('h3')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const name = await panel.locator('h3').textContent();
    if (name === 'Worker') await page.keyboard.press('KeyA');
    else await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
  }
  await page.getByRole('button', { name: /End turn/ }).click();
  await expect(turn).toHaveText('2');
  await page.keyboard.press('Enter');
  await expect(turn).toHaveText('3');
  const explored = page.locator('.top-bar .stat').filter({ hasText: 'Explored' }).locator('strong');
  await expect(explored).not.toHaveText('0%');

  // Save, play on, load back.
  await page.keyboard.press('Control+KeyS');
  await page.getByLabel('Save name').fill('smoke');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(turn).toHaveText('4');
  await page.keyboard.press('Control+KeyL');
  await page.getByRole('button', { name: /^smoke/ }).click();
  await expect(turn).toHaveText('3');

  await page.screenshot({ path: 'test-results/smoke.png' });
  expect(errors).toEqual([]);
});
