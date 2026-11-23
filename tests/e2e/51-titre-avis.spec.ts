import { expect, test } from '@playwright/test';
import { expireTags, loginStudent, sql, uniqueEmail, waitForHydration } from './helpers';

/**
 * « Ton master en une phrase » (issue #20): required at step 2, after « Ce que tu n'as pas aimé »,
 * quotes typed by the student removed, « … » added on the fiche; a review without title shows no
 * empty heading; the title is edited from Mon espace.
 */
test('a review with its title, from the form to the fiche and Mon espace', async ({ page }) => {
  // A published parcours of an open city, with reviews (one at least without title).
  const [program] = await sql<{ id: string; slug: string }>(
    `SELECT p.id, p.slug FROM "Program" p
      WHERE p."isPublished" AND p."inOpenZone"
        AND EXISTS (SELECT 1 FROM "Review" r
                     WHERE r."programId" = p.id AND r.status = 'PUBLISHED' AND r.title IS NULL)
      ORDER BY p.slug LIMIT 1`,
  );
  expect(program).toBeTruthy();
  const email = uniqueEmail('titre');
  await loginStudent(page, email);
  await page.goto(`/avis/nouveau?parcours=${program!.slug}`);
  await waitForHydration(page);
  await page.getByRole('radio', { name: 'En M2' }).click();
  await page.getByLabel('Entré·e en').selectOption(String(new Date().getFullYear() - 1));
  await page.getByRole('button', { name: 'Continuer' }).click();

  await page
    .getByRole('radiogroup', { name: 'Note globale' })
    .getByRole('radio', { name: '4 sur 5' })
    .click();
  await page
    .getByLabel('Ce que tu as aimé')
    .fill('Beaucoup de terrain, des intervenant·es du métier et un stage bien suivi.');
  await page
    .getByLabel('Ce que tu n’as pas aimé')
    .fill('Le premier semestre est très chargé et les salles sont loin du centre.');

  // The title is the last field and blocks « Continuer » while empty or too short.
  const fields = page.locator('textarea, input:not([type=hidden])');
  await expect(fields.last()).toHaveAttribute('placeholder', 'Ex. Le terrain avant tout');
  const title = page.getByLabel('Ton master en une phrase');
  const next = page.getByRole('button', { name: 'Continuer' });
  await expect(next).toBeDisabled();
  await expect(
    page.getByText('Ce sera le titre de ton avis. Encore 5 caractères au moins'),
  ).toBeVisible();
  await title.fill('Top');
  await expect(next).toBeDisabled();
  // A name in the title: the usual warning.
  await title.fill('Merci Mme Durand');
  await expect(
    page.getByRole('alert').filter({ hasText: 'semble citer une personne' }),
  ).toBeVisible();
  await expect(next).toBeDisabled();
  // The quotes typed are removed: « … » comes from the display.
  await title.fill('« Le terrain avant tout »');
  await expect(
    page.getByText(/Ce sera le titre de ton avis\. 59 caractères restants/),
  ).toBeVisible();
  await next.click();
  await expect(page.getByText('« Le terrain avant tout »')).toBeVisible();
  await page.getByLabel(/je respecte la/).check();
  await page.getByRole('button', { name: 'Envoyer mon avis' }).click();
  await expect(page.getByRole('heading', { name: 'Merci, c’est envoyé !' })).toBeVisible();

  const [review] = await sql<{ id: string; ref: string; title: string }>(
    `SELECT r.id, r.ref, r.title FROM "Review" r JOIN "Student" s ON s.id = r."studentId"
      WHERE r."programId" = $1 ORDER BY r."submittedAt" DESC LIMIT 1`,
    [program!.id],
  );
  expect(review?.title).toBe('Le terrain avant tout');
  await sql(`UPDATE "Review" SET status = 'PUBLISHED', "publishedAt" = now() WHERE id = $1`, [
    review!.id,
  ]);
  await expireTags(page, ['reviews', `program:${program!.id}`]);

  // The fiche: the title between « », once; a review without title has no heading.
  await page.goto(`/parcours/${program!.slug}`);
  const card = page.locator(`[id="${review!.ref}"]`);
  await expect(card.getByRole('heading', { level: 3 })).toHaveText('« Le terrain avant tout »');
  const [untitled] = await sql<{ ref: string }>(
    `SELECT ref FROM "Review" WHERE "programId" = $1 AND status = 'PUBLISHED' AND title IS NULL
      ORDER BY "publishedAt" DESC LIMIT 1`,
    [program!.id],
  );
  const bare = page.locator(`[id="${untitled!.ref}"]`);
  if (await bare.count()) await expect(bare.getByRole('heading')).toHaveCount(0);
  // A long title wraps inside the card at 320 px.
  await sql(`UPDATE "Review" SET title = $2 WHERE id = $1`, [
    review!.id,
    // 80 characters without a space: the longest title, which must still wrap.
    'Sansespace'.repeat(8),
  ]);
  await expireTags(page, ['reviews', `program:${program!.id}`]);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.reload();
  await expect(card.getByRole('heading', { level: 3 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Mon espace: the title is edited with the rest, and the review goes back to moderation.
  await page.goto(`/espace/avis/${review!.ref}`);
  await waitForHydration(page);
  await expect(page.getByLabel('Ce que tu n’as pas aimé')).toBeVisible();
  const edit = page.getByLabel('Ton master en une phrase');
  await edit.fill('');
  await page.getByRole('button', { name: 'Enregistrer et renvoyer en relecture' }).click();
  await expect(page.getByText('Résume ton master en une phrase.')).toBeVisible();
  await edit.fill('"Le terrain, avant tout"');
  await page.getByRole('button', { name: 'Enregistrer et renvoyer en relecture' }).click();
  await expect(page).toHaveURL(/\/espace\/avis$/);
  const [edited] = await sql<{ title: string; status: string }>(
    `SELECT title, status FROM "Review" WHERE id = $1`,
    [review!.id],
  );
  expect(edited).toEqual({ title: 'Le terrain, avant tout', status: 'PENDING' });
});
