import { expect, test } from '@playwright/test';
import { ADMIN, loginAdmin, waitForHydration } from './helpers';

test('admin: TOTP login, publish a pending review, matching audit entry', async ({ page }) => {
  // Through the password and TOTP screens, not the saved session.
  await loginAdmin(page, ADMIN, { fresh: true });
  await page.getByRole('link', { name: /^Modération/ }).click();
  await expect(page.getByRole('heading', { name: 'Modération', level: 1 })).toBeVisible();
  await waitForHydration(page);

  const list = page.getByRole('region', { name: 'Avis à valider' });
  const first = list
    .getByRole('button', { pressed: false })
    .or(list.getByRole('button', { pressed: true }))
    .first();
  await expect(first).toBeVisible();
  const detail = page.getByRole('region', { name: 'Détail' });
  const meta = await detail
    .locator('span')
    .filter({ hasText: /^avis-[0-9a-f]{6}/ })
    .first()
    .textContent();
  const ref = /avis-[0-9a-f]{6}/.exec(meta ?? '')?.[0];
  expect(ref).toBeTruthy();

  // A decision other than publishing needs a reason.
  await detail.getByRole('button', { name: 'Demander une reformulation' }).click();
  await expect(page.getByText(/motif communiqué : il est obligatoire/)).toBeVisible();

  await detail.getByRole('button', { name: /^Publier/ }).click();
  await expect(page.getByText('Avis publié.')).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Administration' })
    .getByRole('link', { name: /Journal d’audit/ })
    .click();
  // « Alexis a publié l’avis avis-xxxx », the review as a link.
  await expect(
    page
      .getByRole('region', { name: 'Aujourd’hui' })
      .locator('div.border-b')
      .filter({ hasText: 'a publié l’avis' })
      .filter({ has: page.getByRole('link', { name: ref! }) })
      .first(),
  ).toBeVisible();
});
