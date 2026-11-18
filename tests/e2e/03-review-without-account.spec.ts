import { expect, test } from '@playwright/test';
import {
  codeFrom,
  linkFrom,
  typeCode,
  uniqueEmail,
  waitForMail,
  waitForHydration,
} from './helpers';

test('publishing a review without account: confirmation mail, then moderation', async ({
  page,
}) => {
  const email = uniqueEmail('avis');
  const since = new Date();
  await page.goto('/avis/nouveau');
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await waitForHydration(page);
  // The form header: logo and « Quitter », no search.
  await expect(page.getByRole('link', { name: 'Quitter' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Rechercher un master/ })).toHaveCount(0);

  // Step 1: Ctrl+K puts the cursor in the master field; the master is found by its RNCP
  // number and chosen with the keyboard.
  const master = page.getByRole('combobox', { name: 'Quel master as-tu suivi ?' });
  await page.keyboard.press('Control+k');
  await expect(master).toBeFocused();
  await master.fill('RNCP42684');
  const list = page.getByRole('listbox', { name: 'Masters trouvés' });
  const target = list.getByRole('option', { name: /Histoire de l’art et culture matérielle/ });
  await expect(target).toBeVisible();
  await expect(target.getByText('Trouvé par RNCP · RNCP42684')).toBeVisible();
  for (let i = 0; i < 8 && (await target.getAttribute('aria-selected')) !== 'true'; i++)
    await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Histoire de l’art et culture matérielle')).toBeVisible();
  await expect(page.getByRole('button', { name: /Changer/ })).toBeVisible();
  // A graduate says what they do today; « En poste » asks for the job.
  await page.getByRole('radio', { name: 'Diplômé·e' }).click();
  await page.getByLabel('Entré·e en').selectOption(String(new Date().getFullYear() - 3));
  const next = page.getByRole('button', { name: 'Continuer' });
  await expect(next).toBeDisabled();
  await page.getByRole('radio', { name: 'En poste' }).click();
  await expect(next).toBeDisabled();
  await page.getByLabel('Ton poste').fill('Chargée de médiation, musée municipal');
  await next.click();

  // Step 2: name detection blocks, then a clean text passes
  await page
    .getByRole('radiogroup', { name: 'Note globale' })
    .getByRole('radio', { name: '4 sur 5' })
    .click();
  await page
    .getByLabel('Ce que tu as aimé')
    .fill('Le cours de M. Dupont est passionnant et très concret.');
  await page
    .getByLabel('Ce qui pourrait être mieux')
    .fill('Peu de créneaux pour les projets tutorés en fin de semestre.');
  await expect(
    page.getByRole('alert').filter({ hasText: 'semble citer une personne' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Ton avis' })).toBeVisible();
  await page
    .getByLabel('Ce que tu as aimé')
    .fill('Les cours d’histoire de l’art sont passionnants et très concrets.');
  await page.getByRole('button', { name: 'Continuer' }).click();

  // Step 3: without account
  await page.getByRole('radio', { name: /Sans compte/ }).click();
  await page.getByLabel(/Ton adresse mail/).fill(email);
  await page.getByLabel(/je respecte la/).check();
  await expect(page.getByText('En poste · Chargée de médiation, musée municipal')).toBeVisible();
  await page.getByRole('button', { name: 'Envoyer mon avis' }).click();
  await expect(page.getByRole('heading', { name: 'Merci, c’est envoyé !' })).toBeVisible();

  // Confirmation mail in Mailpit: the code typed on the « Merci » screen → moderation
  const mail = await waitForMail(email, /confirme ton avis/i, since);
  expect(mail.Text).toContain('Histoire de l’art et culture matérielle');
  await typeCode(page, codeFrom(mail));
  await expect(page.getByText('C’est confirmé : ton avis passe en relecture')).toBeVisible();

  // The link of the same mail no longer works (one of the two only, single use)
  await page.goto(linkFrom(mail.HTML, '/avis/confirmer/'));
  await expect(page.getByRole('heading', { name: 'Ce lien ne marche plus' })).toBeVisible();
});
