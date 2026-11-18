import { expect, test } from '@playwright/test';
import { loginStudent, uniqueEmail, waitForMail } from './helpers';

test('magic link login, settings and data export', async ({ page }) => {
  const email = uniqueEmail('espace');
  await loginStudent(page, email);
  await expect(page.getByText('Tu n’as pas encore donné d’avis.')).toBeVisible();
  await page.getByRole('tab', { name: 'Compte' }).click();
  await expect(page).toHaveURL(/\/espace\/compte$/);
  const since = new Date();
  await page.getByRole('button', { name: 'Recevoir une copie de mes données' }).click();
  await expect(page.getByText(/arrive par mail/)).toBeVisible();
  const mail = await waitForMail(email, /copie de données/, since);
  expect(mail.Subject).toContain('copie');
});

test('report a review gets a SIG reference', async ({ page }) => {
  await page.goto('/signaler?avis=avis-81c02e');
  await expect(page.getByText('ID avis-81c02e')).toBeVisible();
  await page.getByLabel('Il ne parle pas de la formation').check();
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click();
  await expect(page.getByText(/Référence SIG-\d{4}-\d{4}/)).toBeVisible();
});
