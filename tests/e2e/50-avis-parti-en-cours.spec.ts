import { expect, test, type Page } from '@playwright/test';
import {
  codeFrom,
  expireTags,
  loginAdmin,
  MODERATOR,
  sql,
  typeCode,
  uniqueEmail,
  waitForHydration,
  waitForMail,
} from './helpers';

/** No horizontal scroll of the page at the current width. */
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * « J'ai arrêté en cours » (issue #18): the fourth status of the form, its optional « Et
 * aujourd'hui ? » and « Qu'est-ce qui t'a fait partir ? », moderation, then the fiche (pastille
 * « Ex », no year, « Pourquoi je suis parti·e », filter « Parti·es en cours »).
 */
test('a review by someone who left during the year, from the form to the fiche', async ({
  page,
}) => {
  // A published parcours of an open city, with reviews but none by someone who left.
  const [program] = await sql<{ slug: string; title: string }>(
    `SELECT p.slug, p.title FROM "Program" p
      WHERE p."isPublished" AND p."inOpenZone"
        AND EXISTS (SELECT 1 FROM "Review" r WHERE r."programId" = p.id AND r.status = 'PUBLISHED')
        AND NOT EXISTS (SELECT 1 FROM "Review" r WHERE r."programId" = p.id AND r.level = 'LEFT')
      ORDER BY p.slug LIMIT 1`,
  );
  expect(program).toBeTruthy();
  const { slug } = program!;

  // Before: no « Parti·es en cours » filter on the fiche.
  await page.goto(`/parcours/${slug}`);
  const filters = page.getByRole('navigation', { name: 'Filtrer les avis par niveau' });
  await expect(filters.getByRole('link', { name: 'Diplômé·es' })).toBeVisible();
  await expect(filters.getByRole('link', { name: 'Parti·es en cours' })).toHaveCount(0);

  const email = uniqueEmail('parti');
  const since = new Date();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/avis/nouveau?parcours=${slug}`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await waitForHydration(page);

  // Step 1: four statuses in one radio group, reached with the arrow keys.
  const status = page.getByRole('group', { name: 'Tu es…' });
  await expect(status.getByRole('radio')).toHaveCount(4);
  await status.getByRole('radio', { name: 'En M1' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const left = status.getByRole('radio', { name: 'J’ai arrêté en cours' });
  await expect(left).toBeFocused();
  await expect(left).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('link', { name: 'Écris-nous' })).toHaveAttribute(
    'href',
    '/a-propos#contact',
  );
  await noHorizontalScroll(page);

  // « Et aujourd'hui ? » is optional: step 1 is valid without it, and a second click unselects.
  const today = page.getByRole('group', { name: /Et aujourd’hui \? \(facultatif\)/ });
  await expect(today.getByRole('radio')).toHaveText([
    'Dans une autre formation',
    'En emploi',
    'En recherche',
    'Autre situation',
  ]);
  await expect(page.getByLabel('Ton poste')).toHaveCount(0);
  await page.getByLabel('Entré·e en').selectOption(String(new Date().getFullYear() - 1));
  const next = page.getByRole('button', { name: 'Continuer' });
  await expect(next).toBeEnabled();
  const other = today.getByRole('radio', { name: 'Dans une autre formation' });
  await other.click();
  await expect(other).toHaveAttribute('aria-checked', 'true');
  await other.click();
  await expect(other).toHaveAttribute('aria-checked', 'false');
  await other.click();
  // Another status clears the answer.
  await status.getByRole('radio', { name: 'En M2' }).click();
  await expect(today).toHaveCount(0);
  await left.click();
  await expect(other).toHaveAttribute('aria-checked', 'false');
  await other.click();
  await next.click();

  // Step 2: « Qu'est-ce qui t'a fait partir ? », checked for names like the other fields.
  await page
    .getByRole('radiogroup', { name: 'Note globale' })
    .getByRole('radio', { name: '2 sur 5' })
    .click();
  await page
    .getByLabel('Ce que tu as aimé')
    .fill('Les cours d’histoire du patrimoine sont solides et l’équipe reste disponible.');
  await page
    .getByLabel('Ce qui pourrait être mieux')
    .fill('Très peu de numérique alors que la brochure le met en avant partout.');
  const why = page.getByLabel(/Qu’est-ce qui t’a fait partir \?/);
  await expect(why).toHaveAttribute('placeholder', /Une réorientation, le contenu/);
  await expect(
    page.getByText('Reste général : évite les détails qui pourraient te faire reconnaître.'),
  ).toBeVisible();
  await why.fill('Mme Martin m’a convaincue de changer de voie.');
  await expect(
    page.getByRole('alert').filter({ hasText: 'semble citer une personne' }),
  ).toBeVisible();
  await expect(next).toBeDisabled();
  await why.fill('Je voulais travailler dans la médiation numérique, ce master ne m’y menait pas.');
  await noHorizontalScroll(page);

  // The field goes with the status.
  await page.getByRole('button', { name: 'Retour' }).click();
  await status.getByRole('radio', { name: 'En M2' }).click();
  await next.click();
  await expect(page.getByLabel(/Qu’est-ce qui t’a fait partir/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Retour' }).click();
  await left.click();
  await today.getByRole('radio', { name: 'Dans une autre formation' }).click();
  await next.click();
  await expect(why).toHaveValue(/médiation numérique/);
  await next.click();

  // Step 3: « Anonyme · A quitté le master en cours », never a year.
  const preview = page.getByText('Ton avis apparaîtra ainsi').locator('..');
  await expect(preview).toContainText('Anonyme · A quitté le master en cours');
  await expect(preview).toContainText('Dans une autre formation');
  await expect(preview).not.toContainText('promo');
  await page.getByRole('radio', { name: /Sans compte/ }).click();
  await page.getByLabel(/Ton adresse mail/).fill(email);
  await page.getByLabel(/je respecte la/).check();
  await page.getByRole('button', { name: 'Envoyer mon avis' }).click();
  await expect(page.getByRole('heading', { name: 'Merci, c’est envoyé !' })).toBeVisible();
  await typeCode(page, codeFrom(await waitForMail(email, /confirme ton avis/i, since)));
  await expect(page.getByText('C’est confirmé : ton avis passe en relecture')).toBeVisible();

  const [review] = await sql<{ id: string; ref: string; leaveReason: string; cohortYear: number }>(
    `SELECT r.id, r.ref, r."leaveReason", r."cohortYear" FROM "Review" r
       JOIN "Program" p ON p.id = r."programId"
      WHERE p.slug = $1 AND r.level = 'LEFT' ORDER BY r."submittedAt" DESC LIMIT 1`,
    [slug],
  );
  expect(review?.leaveReason).toContain('médiation numérique');
  // The oldest of the queue, so on its first page.
  await sql(`UPDATE "Review" SET "submittedAt" = now() - interval '30 days' WHERE id = $1`, [
    review!.id,
  ]);

  // Moderation: the status and the reason are visible, then the review is published.
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAdmin(page, MODERATOR);
  await page.goto('/admin/moderation?file=avis');
  await waitForHydration(page);
  await page
    .getByRole('region', { name: 'Avis à valider' })
    .getByRole('button', { name: new RegExp(`Avis ${review!.ref}`) })
    .click();
  const detail = page.getByRole('region', { name: 'Détail' });
  await expect(detail).toContainText('Anonyme · A quitté le master en cours');
  await expect(detail).not.toContainText(`promo ${review!.cohortYear}`);
  await expect(detail).toContainText('Pourquoi je suis parti·e : Je voulais travailler');
  await expect(detail).toContainText('Aujourd’hui : dans une autre formation');
  await detail.getByRole('button', { name: /^Publier/ }).click();
  await expect(page.getByText('Avis publié.')).toBeVisible();

  // « Tous les avis » filtered on this status.
  await page.goto('/admin/avis?niveau=LEFT');
  const row = page.getByRole('row').filter({ hasText: review!.ref });
  await expect(row).toContainText('Anonyme · Ex');
  await expect(row).not.toContainText(String(review!.cohortYear));

  // The fiche: filter « Parti·es en cours », pastille « Ex », no year, « Pourquoi je suis parti·e ».
  await expireTags(page, ['reviews']);
  await page.goto(`/parcours/${slug}`);
  await filters.getByRole('link', { name: 'Parti·es en cours' }).click();
  await expect(page).toHaveURL(/niveau=LEFT/);
  await expect(page.getByText(/sur 1 avis, dont 0 vérifié · parti·es en cours/)).toBeVisible();
  const card = page.locator(`[id="${review!.ref}"]`);
  await expect(card).toContainText('Anonyme · A quitté le master en cours');
  await expect(card).not.toContainText('promo');
  await expect(card).not.toContainText(String(review!.cohortYear));
  await expect(card.getByText('Ex', { exact: true })).toBeVisible();
  await expect(card).toContainText('Aujourd’hui : dans une autre formation');
  await expect(card.getByText('Pourquoi je suis parti·e')).toBeVisible();
  await expect(card).toContainText('médiation numérique');
  await page.setViewportSize({ width: 320, height: 800 });
  await noHorizontalScroll(page);
});
