import { expect, test } from '@playwright/test';
import { loginAdmin, waitForHydration } from './helpers';

/**
 * « Rapprochements à valider »: filters, selection and validation of a proposal.
 * Proposals only exist after a real (or replayed) simulation: skipped otherwise.
 */
test('admin: filter the merge proposals, select one and validate it', async ({ page }) => {
  await loginAdmin(page);
  await page.goto('/admin/recuperation/rapprochements?type=merge');
  await waitForHydration(page);
  await expect(
    page.getByRole('heading', { name: 'Rapprochements à valider', level: 1 }),
  ).toBeVisible();
  const boxes = page.getByRole('checkbox', { name: /^Sélectionner :/ });
  test.skip(
    (await boxes.count()) === 0,
    'aucune proposition (lancer une simulation réelle ou make data-replay-pilot)',
  );
  await expect(page.getByText('Fusion', { exact: true }).first()).toBeVisible();
  await boxes.first().check();
  await page.getByRole('button', { name: /Valider la sélection \(1\)/ }).click();
  await expect(page.getByText(/1 proposition\(s\) validée\(s\)/)).toBeVisible();
});
