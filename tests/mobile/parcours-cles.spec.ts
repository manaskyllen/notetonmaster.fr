import { expect, test } from '@playwright/test';
import {
  codeFrom,
  loginAdmin,
  MODERATOR,
  sql,
  typeCode,
  uniqueEmail,
  waitForHydration,
  waitForMail,
} from '../e2e/helpers';
import { horizontalOverflow, VNP } from '../e2e/responsive';

/**
 * Key journeys on a phone (issue #14), in the projects « mobile-iphone » and « mobile-android »
 * (playwright.config.ts): touch, mobile viewport and user agent, Chromium engine.
 */
const noSideScroll = async (page: import('@playwright/test').Page, where: string) => {
  const { over, culprits } = await horizontalOverflow(page);
  expect(over, `${where}: ${culprits.join(', ')}`).toBeLessThanOrEqual(0);
};

test('search, fiche, share, then a review, on a phone', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: ShareData[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => void w.__shared.push(data),
    });
  });
  await page.goto('/');
  await waitForHydration(page);
  await noSideScroll(page, 'accueil');

  // Search from the home page, then the fiche.
  await page.getByRole('combobox', { name: 'Quoi ?' }).fill('nouveaux patrimoines');
  await page
    .getByRole('listbox', { name: 'Suggestions' })
    .getByRole('group', { name: 'Masters' })
    .getByRole('option', { name: /Valorisation des nouveaux patrimoines/ })
    .first()
    .tap();
  await expect(page).toHaveURL((u) => u.pathname === `/parcours/${VNP}`);
  await waitForHydration(page);
  await noSideScroll(page, 'fiche');

  // Share: the share sheet of the phone, with the link of the review form.
  await page.getByRole('button', { name: 'Partager', exact: true }).tap();
  await page.getByRole('button', { name: /Inviter ma promo à donner son avis/ }).tap();
  const shared = await page.evaluate(
    () => (window as unknown as { __shared: ShareData[] }).__shared,
  );
  expect(shared[0]?.url).toBe(`${baseURL}/avis/nouveau?parcours=${VNP}`);

  // The review, from the fiche, entirely on the phone.
  const email = uniqueEmail('mobile');
  const since = new Date();
  await page.getByRole('link', { name: 'Donner mon avis' }).first().tap();
  await waitForHydration(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.getByRole('radio', { name: 'En M2' }).tap();
  await page.getByLabel('Entré·e en').selectOption(String(new Date().getFullYear() - 1));
  await noSideScroll(page, 'avis, étape 1');
  await page.getByRole('button', { name: 'Continuer' }).tap();
  await page
    .getByRole('radiogroup', { name: 'Note globale' })
    .getByRole('radio', { name: '4 sur 5' })
    .tap();
  await page
    .getByLabel('Ce que tu as aimé')
    .fill('Beaucoup de terrain et des intervenant·es du métier, bien suivis.');
  await page
    .getByLabel('Ce que tu n’as pas aimé')
    .fill('Les salles sont loin et l’emploi du temps arrive tard.');
  await noSideScroll(page, 'avis, étape 2');
  await page.getByRole('button', { name: 'Continuer' }).tap();
  await page.getByRole('radio', { name: /Sans compte/ }).tap();
  await page.getByLabel(/Ton adresse mail/).fill(email);
  await page.getByLabel(/je respecte la/).check();
  await noSideScroll(page, 'avis, étape 3');
  await page.getByRole('button', { name: 'Envoyer mon avis' }).tap();
  await expect(page.getByRole('heading', { name: 'Merci, c’est envoyé !' })).toBeVisible();
  await typeCode(page, codeFrom(await waitForMail(email, /confirme ton avis/i, since)));
  await expect(page.getByText('C’est confirmé : ton avis passe en relecture')).toBeVisible();
});

test('moderate a review and handle a contact message, on a phone', async ({ page }) => {
  // A contact message, written on the phone.
  await page.goto('/a-propos#contact');
  await waitForHydration(page);
  const subject = `Mobile ${Date.now().toString(36)}`;
  await page.getByLabel('Sujet').selectOption('other');
  await page.getByLabel('Ton mail').fill(uniqueEmail('contact-mobile'));
  await page
    .getByRole('textbox', { name: 'Message' })
    .fill(`${subject} : une question sur le site, depuis un téléphone.`);
  await page.getByRole('button', { name: 'Envoyer' }).tap();
  await expect(page.getByText('Message envoyé, merci !')).toBeVisible();

  // A review waiting for moderation, the oldest of the queue (on its first page).
  const [review] = await sql<{ id: string; ref: string }>(
    `SELECT id, ref FROM "Review" WHERE status = 'PENDING' ORDER BY "submittedAt" LIMIT 1`,
  );
  test.skip(!review, 'no review waiting for moderation in the fixtures');

  await loginAdmin(page, MODERATOR);
  await page.goto('/admin/moderation?file=avis');
  await waitForHydration(page);
  await noSideScroll(page, 'modération');
  await page.getByRole('region', { name: 'Avis à valider' }).getByRole('button').first().tap();
  const detail = page.getByRole('region', { name: 'Détail' });
  await detail.scrollIntoViewIfNeeded();
  await detail.getByRole('button', { name: /^Publier/ }).tap();
  await expect(page.getByText('Avis publié.')).toBeVisible();

  // The message, by its reference (CON-XXXXXXXX), made the oldest of its queue.
  const [message] = await sql<{ id: string }>(
    `SELECT id FROM "ContactMessage" WHERE body LIKE $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [`${subject} %`],
  );
  await sql(`UPDATE "ContactMessage" SET "createdAt" = now() - interval '30 days' WHERE id = $1`, [
    message!.id,
  ]);
  const ref = `CON-${message!.id.slice(-8).toUpperCase()}`;
  await page.goto('/admin/moderation?file=contact');
  await waitForHydration(page);
  await noSideScroll(page, 'modération, contact');
  const item = page.getByRole('button').filter({ hasText: ref });
  await item.tap();
  const detail2 = page.getByRole('region', { name: 'Détail' });
  await expect(detail2).toContainText(subject);
  await detail2.getByRole('button', { name: 'Marquer comme traité' }).tap();
  await expect(item).toHaveCount(0);
});
