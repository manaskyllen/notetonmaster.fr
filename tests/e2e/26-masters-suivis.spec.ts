import { expect, test, type Page } from '@playwright/test';
import { loginStudent, sql, uniqueEmail, waitForHydration } from './helpers';

/** Mon espace › Masters suivis, new cards. */
const VNP = 'valorisation-des-nouveaux-patrimoines';
const VNP_TITLE = 'Valorisation des nouveaux patrimoines';

async function follow(page: Page, slug: string) {
  await page.goto(`/parcours/${slug}`);
  await waitForHydration(page);
  const button = page.getByRole('button', { name: 'Suivre ce master' }).first();
  const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.ok());
  await button.click();
  await saved;
}

async function noReviewProgram() {
  const [r] = await sql<{ slug: string; title: string }>(
    `SELECT p.slug, i.title FROM "Program" p JOIN "ProgramSearchIndex" i ON i."programId" = p.id
      WHERE p."isPublished" AND i."reviewCount" = 0 AND i.applications > 0 AND i.offers > 0
      ORDER BY p.slug LIMIT 1`,
  );
  return r!;
}

test('cards: establishment, heart, title, new reviews, three figures, compare and fiche link', async ({
  page,
}) => {
  const email = uniqueEmail('suivis-cartes');
  await loginStudent(page, email);
  const empty = await noReviewProgram();
  await follow(page, VNP);
  await follow(page, empty.slug);
  // VNP was last opened long ago: its published reviews are new.
  await sql(
    `UPDATE "Favorite" SET "lastViewedAt" = '2000-01-01'
      WHERE id = (SELECT f.id FROM "Favorite" f JOIN "Program" p ON p.id = f."programId"
                   WHERE p.slug = $1 ORDER BY f."createdAt" DESC LIMIT 1)`,
    [VNP],
  );
  await page.goto('/espace/suivis');
  await waitForHydration(page);

  const grid = page
    .getByRole('list')
    .filter({ has: page.getByRole('button', { name: /^Ne plus suivre : / }) });
  const columns = await grid.evaluate((el) =>
    getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat),
  );
  for (const w of columns) expect(w).toBeGreaterThanOrEqual(280);

  const card = (title: string) =>
    grid
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: title, exact: true }) });
  const vnp = card(VNP_TITLE);
  const heart = vnp.getByRole('button', { name: `Ne plus suivre : ${VNP_TITLE}` });
  // measured once the cascade of the cards is over (rotated boxes are larger)
  await vnp.evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished)));
  expect(await heart.boundingBox()).toMatchObject({ width: 44, height: 44 });
  await expect(vnp.getByText('Nantes Université', { exact: true })).toBeVisible();
  const title = vnp.getByRole('link', { name: VNP_TITLE, exact: true });
  expect(
    await title.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.fontFamily.includes('Bricolage'), s.fontWeight, s.fontSize];
    }),
  ).toEqual([true, '700', '20px']);
  await expect(vnp.getByText(/^\d+ nouve(aux|l) avis depuis ta dernière visite$/)).toBeVisible();
  // The master card of the whole site: modality line, rating, reviews; never places
  await expect(vnp.getByText('2 ans · Présentiel')).toBeVisible();
  await expect(vnp.getByText(/Places|Propositions|1 pour/)).toHaveCount(0);
  const note = vnp.getByRole('img', { name: /^Note : \d(,\d)? sur 5$/ });
  await expect(note).toBeVisible();
  await expect(vnp.getByText(/^\d+ avis$/)).toBeVisible();
  await expect(vnp.getByText(/\d+ % le recommandent$/)).toBeVisible();
  expect(await note.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    'rgb(245, 244, 248)',
  );

  const other = card(empty.title);
  await expect(other.getByText('Pas encore d’avis')).toBeVisible();
  await expect(other.getByText(/nouve(aux|l) avis/)).toHaveCount(0);

  await grid.screenshot({ path: test.info().outputPath('masters-suivis.png') });
  // Ticked for the comparison: violet border
  await vnp.getByRole('button', { name: `Comparer : ${VNP_TITLE}` }).click();
  await expect(vnp).toHaveCSS('border-top-color', 'rgb(90, 59, 240)');
  // Hover lifts the card
  await other.hover();
  await expect(other).toHaveCSS('transform', /matrix\(1, 0, 0, 1, 0, -3\)/);

  // Opening the fiche counts as a visit: the label goes
  await vnp.getByRole('link', { name: VNP_TITLE, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/parcours/${VNP}`));
  // Stored right after the fiche's response (after()): may take a moment.
  await expect(async () => {
    await page.goto('/espace/suivis');
    await expect(card(VNP_TITLE).getByText(/nouve(aux|l) avis depuis/)).toHaveCount(0, {
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });

  // The heart stops following
  await card(VNP_TITLE)
    .getByRole('button', { name: `Ne plus suivre : ${VNP_TITLE}` })
    .click();
  await expect(card(VNP_TITLE)).toHaveCount(0);
});
