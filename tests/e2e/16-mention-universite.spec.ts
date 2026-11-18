import { expect, test } from '@playwright/test';
import { sql, waitForHydration } from './helpers';

/** Mention and university pages. */

test('/mentions/droit: a list of 20, no grouped view, no figure cards, nothing after the list', async ({
  page,
}) => {
  await page.goto('/mentions/droit?vue=groupe');
  await waitForHydration(page);
  // `vue=groupe` is ignored: always the list
  await expect(page.locator('details[id^="groupe-"]')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Sommaire' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Affichage' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: /^Les \d+ parcours$/ })).toBeVisible();
  const rows = page.getByRole('list', { name: 'Parcours de la page' }).getByRole('listitem');
  expect(await rows.count()).toBeLessThanOrEqual(20);
  await expect(page.getByText(/^1–\d+ sur \d+ parcours$/)).toBeVisible();
  // the hero keeps only its label, title and sentence
  const hero = page.locator('section').filter({ has: page.getByRole('heading', { level: 1 }) });
  await expect(hero.locator('dl')).toHaveCount(0);
  await expect(page.getByText(/places cumulées|niveau RNCP/)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Comment est organisé un master' })).toHaveCount(0);
  await expect(page.getByText('Mention · tu es ici')).toHaveCount(0);
  // no outcomes on a mention page any more
  await expect(page.getByText(/blocs de compétences/i)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Métiers visés' })).toHaveCount(0);
  await expect(page.getByText(/fiche RNCP de cette mention/)).toHaveCount(0);
  // the page stops after the list: its notes line closes it
  await expect(page.getByText(/^Notes : avis publiés sur notetonmaster\./)).toBeVisible();
  // only these sorts
  await expect(page.getByRole('combobox', { name: 'Trier par' }).locator('option')).toHaveText([
    'Mieux notés',
    'Plus d’avis',
    'A → Z',
  ]);
});

test('/mentions/droit: establishments facet with counters, abroad', async ({ page }) => {
  await page.goto('/mentions/droit');
  await waitForHydration(page);
  const filters = page.getByRole('complementary', { name: 'Filtres' });
  await expect(filters.getByRole('checkbox').first()).toBeVisible();
  const abroad = filters.getByRole('checkbox', { name: /À l’étranger/ });
  test.skip(!(await abroad.count()), 'no parcours abroad in this mention');
  await abroad.check();
  await expect(page).toHaveURL(/lieu=etranger/);
});

test('a university: the Explorer cards; establishments-composantes switch', async ({ page }) => {
  // Paris-Saclay, the only university with établissements-composantes in the data, is not in an
  // open city: Oniris (Nantes) is made a composante of Nantes Université for the test.
  const [oniris] = await sql<{ id: string; parentId: string | null }>(
    `SELECT id, "parentId" FROM "University" WHERE slug = 'oniris-vetagrobio'`,
  );
  await sql(
    `UPDATE "University" SET "parentId" = (SELECT id FROM "University" WHERE slug = 'nantes-universite') WHERE id = $1`,
    [oniris!.id],
  );
  try {
    await page.goto('/universites/nantes-universite');
    await waitForHydration(page);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Les masters de la fac' }),
    ).toBeVisible();
    await expect(page.locator('details[id^="groupe-"]')).toHaveCount(0);
    const card = page
      .getByRole('list', { name: 'Parcours de la page' })
      .getByRole('listitem')
      .first();
    await expect(card).toHaveClass(/nm-followcard/);
    await expect(card.getByRole('link', { name: /^Suivre : / })).toBeVisible();
    const sw = page.getByRole('switch', { name: /Inclure les parcours/ });
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(sw).not.toHaveAttribute('data-moved');
    await sw.click();
    await expect(page).toHaveURL(/inclure=non/);
    const off = page.getByRole('switch', { name: /Inclure les parcours/ });
    await expect(off).toHaveAttribute('aria-checked', 'false');
    // the shared switch: it moved, so the knob stretches once
    await expect(off).toHaveAttribute('data-moved');
  } finally {
    await sql(`UPDATE "University" SET "parentId" = $1 WHERE id = $2`, [
      oniris!.parentId,
      oniris!.id,
    ]);
  }
});
