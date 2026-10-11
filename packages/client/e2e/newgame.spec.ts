import { expect, test } from '@playwright/test';

test('the new game screen offers a random civilization and remembers the last choices', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  const civs = page.getByRole('radiogroup', { name: 'Civilization' });
  await expect(civs.getByRole('radio', { name: /Random/ })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: /^Tiny/ }).click();
  await civs.getByRole('radio').nth(1).click();
  const picked = await civs.getByRole('radio').nth(1).locator('span').first().textContent();
  await page.getByRole('radiogroup', { name: 'Climate' }).getByRole('radio', { name: 'Wet' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.top-bar .stat strong').filter({ hasText: /^Turn / })).toHaveText('Turn 1');

  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByRole('button', { name: /^Tiny/ })).toHaveClass(/on/);
  await expect(page.getByRole('radiogroup', { name: 'Climate' }).getByRole('radio', { name: 'Wet' })).toHaveAttribute('aria-checked', 'true');
  await expect(civs.getByRole('radio', { name: new RegExp(picked!) })).toHaveAttribute('aria-checked', 'true');

  // A remembered Random stays random.
  await civs.getByRole('radio', { name: /Random/ }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.top-bar .stat strong').filter({ hasText: /^Turn / })).toHaveText('Turn 1');
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(civs.getByRole('radio', { name: /Random/ })).toHaveAttribute('aria-checked', 'true');
});
