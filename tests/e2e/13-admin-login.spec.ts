import { expect, test } from '@playwright/test';
import { waitForHydration } from './helpers';

/** Admin login page: a bare card, no demo hint, no prefilled address. */
test('admin login shows only the form and the Turnstile line', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/admin/login');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'Connexion', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Adresse mail')).toHaveValue('');

  const card = page.locator('main section');
  await expect(card).not.toContainText('Administration');
  await expect(card).not.toContainText('Mot de passe oublié');
  await expect(card).not.toContainText('notetonmaster-demo');
  await expect(card).not.toContainText('make totp');
  await expect(card).not.toContainText('journal d’audit');
  await expect(card.getByRole('link', { name: 'Confidentialité' })).toHaveCount(0);

  const line = card.getByText('Protégé contre les robots par Cloudflare Turnstile.', {
    exact: true,
  });
  await expect(line).toBeVisible();
  // One line, under a rule, at the bottom of the card.
  await expect(line).toHaveCSS('white-space', 'nowrap');
  await expect(line).toHaveCSS('border-top-style', 'solid');
  const lines = await line.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
  });
  expect(lines).toBe(1);
});
