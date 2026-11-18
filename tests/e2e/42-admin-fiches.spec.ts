import { expect, test } from '@playwright/test';
import { loginAdmin, waitForHydration } from './helpers';

test('admin fiches: view, filters, sort and page in the URL; the drawer works with the keyboard', async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto('/admin/fiches?vue=toutes&type=parcours&tri=nom&page=2');
  await waitForHydration(page);
  await expect(page.getByRole('link', { name: /^Toutes/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Type')).toHaveValue('parcours');
  await expect(page.getByLabel('Tri')).toHaveValue('nom');
  await expect(page.getByRole('status').filter({ hasText: /^51–100 sur / })).toBeVisible();

  // A new filter keeps the others and goes back to page 1.
  await page.getByLabel('Problème').selectOption('sans-programme');
  await expect(page).toHaveURL(/probleme=sans-programme/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page).toHaveURL(/vue=toutes/);
  await expect(page).toHaveURL(/tri=nom/);
  await expect(page.getByRole('link', { name: 'Effacer' })).toBeVisible();
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByLabel('Problème')).toHaveValue('sans-programme');

  // Drawer: modal dialog, focus inside, Tab stays inside, Échap closes and gives the focus back.
  const opener = page.getByRole('table').getByRole('button').first();
  const name = (await opener.locator('span.truncate').first().textContent())!.trim();
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name, level: 2 })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fermer' })).toBeFocused();
  await expect(page).toHaveURL(/fiche=/);
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page).not.toHaveURL(/fiche=/);
});
