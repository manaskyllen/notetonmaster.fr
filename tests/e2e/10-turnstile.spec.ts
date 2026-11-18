import { expect, test } from '@playwright/test';
import { waitForHydration } from './helpers';

test('Turnstile: with the token "fail", the contact form is refused and nothing is saved', async ({
  page,
}) => {
  const stamp = `Message de test Turnstile ${Date.now()}`;
  await page.goto('/a-propos');
  // Mock mode: the widget hands out the token stored in localStorage (here "fail").
  await page.evaluate(() => localStorage.setItem('nm-turnstile-mock', 'fail'));
  await page.reload();
  await waitForHydration(page);
  const form = page.locator('#contact form');
  await form.getByLabel('Sujet').selectOption({ index: 1 });
  await form.getByLabel('Ton mail').fill('contact.e2e@exemple.fr');
  await form.getByLabel('Message').fill(stamp);
  await expect(form.getByText(/Protégé contre les robots par Cloudflare Turnstile/)).toBeVisible();
  await form.getByRole('button', { name: 'Envoyer' }).click();
  await expect(
    form.getByText('La vérification anti-robot a échoué. Recharge la page et réessaie.'),
  ).toBeVisible();
  await expect(page.getByText('Message envoyé, merci !')).toHaveCount(0);

  // With the normal mock token, the same message goes through.
  await page.evaluate(() => localStorage.removeItem('nm-turnstile-mock'));
  await page.reload();
  await waitForHydration(page);
  await form.getByLabel('Sujet').selectOption({ index: 1 });
  await form.getByLabel('Ton mail').fill('contact.e2e@exemple.fr');
  await form.getByLabel('Message').fill(stamp);
  await form.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText('Message envoyé, merci !')).toBeVisible();
});
