import { expect, test } from '@playwright/test';
import { loginAdmin, waitForHydration } from './helpers';

test('admin: wrong password refused without telling whether the account exists, TOTP login, fiche edit locks the field, audit entry', async ({
  page,
}) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await waitForHydration(page);
  await page.getByLabel('Adresse mail').fill('alexis@notetonmaster.example');
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Continuer' }).click();
  // The same answer as for an unknown address: the attempts left are only shown at the TOTP step.
  await expect(
    page.getByText('Adresse ou mot de passe incorrect, ou compte temporairement bloqué.'),
  ).toBeVisible();

  await loginAdmin(page);
  await page
    .getByRole('navigation', { name: 'Administration' })
    .getByRole('link', { name: /^Fiches/ })
    .click();
  // Thousands of fiches, 50 per page: search it first, in every fiche (not only « À traiter »).
  await page.getByRole('link', { name: /^Toutes/ }).click();
  // the new list first: typed before it arrives, the search would be wiped
  await expect(page).toHaveURL(/vue=toutes/);
  await waitForHydration(page);
  await page.getByLabel('Rechercher une fiche').fill('Histoire de l’art et culture matérielle');
  await page
    .getByRole('table')
    .getByRole('button', { name: /Histoire de l’art et culture matérielle/ })
    .first()
    .click();
  const detail = page.getByRole('dialog');
  await expect(
    detail.getByRole('heading', { name: 'Histoire de l’art et culture matérielle' }),
  ).toBeVisible();
  await detail.getByRole('link', { name: 'Modifier' }).click();
  await expect(
    page.getByRole('heading', { name: 'Histoire de l’art et culture matérielle', level: 1 }),
  ).toBeVisible();

  const stamp = `Dossier puis entretien (${Date.now()})`;
  await page.getByLabel('Sélection', { exact: true }).fill(stamp);
  await expect(page.getByRole('button', { name: 'Verrouillé : Sélection' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Enregistré · ajouté au journal d’audit')).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Administration' })
    .getByRole('link', { name: /Journal d’audit/ })
    .click();
  // A full sentence (« Alexis a modifié <fiche> »), the fiche as a link, the before / after.
  const entry = page
    .getByRole('region', { name: 'Aujourd’hui' })
    .locator('div.border-b')
    .filter({ hasText: /a modifié/ })
    .filter({ has: page.getByRole('link', { name: 'Histoire de l’art et culture matérielle' }) })
    .first();
  await expect(entry).toContainText('Alexis');
  await entry.getByRole('button', { name: 'Détail' }).click();
  const diff = entry.getByRole('table', { name: 'Avant et après' });
  await expect(diff.getByRole('row').filter({ hasText: 'Sélection' })).toContainText(stamp);
  await expect(entry).toContainText(/ip [\d.x:]+|ip et session/);
});
