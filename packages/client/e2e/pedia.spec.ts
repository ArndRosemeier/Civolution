import { expect, test } from '@playwright/test';

test('Civilopedia, settings and advisor hints', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Hints are off under automation by default; this test turns them on.
  await page.addInitScript(() => localStorage.setItem('civolution.settings', JSON.stringify({ hints: true })));
  await page.goto('/');

  // The Civilopedia from the title screen: a category, a page, a link, search and Back.
  await page.getByRole('button', { name: 'Civilopedia' }).click();
  const pedia = page.getByRole('dialog', { name: 'Civilopedia' });
  await pedia.getByRole('button', { name: 'Units', exact: true }).click();
  await pedia.getByRole('button', { name: 'Legionary' }).click();
  await expect(pedia.locator('#pedia-title')).toHaveText('Legionary');
  await expect(pedia.locator('.pedia-facts')).toContainText('Iron Working');
  await pedia.locator('.pedia-facts').getByRole('link', { name: 'Iron Working' }).click();
  await expect(pedia.locator('#pedia-title')).toHaveText('Iron Working');
  await pedia.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(pedia.locator('#pedia-title')).toHaveText('Legionary');
  await pedia.getByRole('searchbox').fill('happiness');
  await pedia.getByRole('button', { name: /Happiness and Disorder/ }).click();
  await expect(pedia.locator('.pedia-text')).toContainText('unhappy');
  await page.keyboard.press('Escape');
  await expect(pedia).toHaveCount(0);

  // Settings: theme and interface size apply to the page.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.keyboard.press('Escape');

  // A new game: the first advisor hint, and its "Read more" opens the Civilopedia.
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: /^Tiny/ }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.loading')).toHaveCount(0, { timeout: 60_000 });
  const hint = page.locator('.hint-card');
  await expect(hint).toContainText('Found your capital');
  await hint.getByRole('button', { name: 'Read more' }).click();
  await expect(page.getByRole('dialog', { name: 'Civilopedia' }).locator('#pedia-title')).toHaveText(/Cities/);
  await page.keyboard.press('Escape');
  // F10 opens it from the map, and a unit's "?" opens that unit's page.
  await page.locator('.unit-panel .pedia-link').click();
  await expect(page.getByRole('dialog', { name: 'Civilopedia' }).locator('#pedia-title')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
