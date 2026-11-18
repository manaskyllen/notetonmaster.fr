import { expect, test } from '@playwright/test';

test('navigation: no "Comparer" in the header; Explorer → 2 programs → comparator → back', async ({
  page,
}) => {
  await page.goto('/explorer');
  const header = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(header.getByRole('link', { name: 'Explorer' })).toBeVisible();
  await expect(header.getByRole('link', { name: /Comparer/ })).toHaveCount(0);

  // Thousands of programs: each one is found by a search; the selection follows.
  const card = (title: string) =>
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: title, exact: true }) });
  await page.goto('/explorer?q=Valorisation des nouveaux patrimoines');
  // Ticking a program brings up the comparison bar (clicked until hydrated).
  await expect(async () => {
    await card('Valorisation des nouveaux patrimoines')
      .getByRole('button', { name: /^Comparer/ })
      .click();
    await expect(page.getByText(/À comparer \(1\/3\)/)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  // a second parcours in another open city (Illkirch, in the Strasbourg area)
  await page.goto('/explorer?q=Droit des affaires');
  await card('Droit des affaires (fixtures)')
    .getByRole('button', { name: /^Comparer/ })
    .click();
  await expect(page.getByText(/À comparer \(2\/3\)/)).toBeVisible();
  await page.getByRole('link', { name: 'Comparer (2)' }).click();

  await expect(page).toHaveURL(/\/comparer\?ids=/);
  await expect(
    page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', {
      name: /Comparer/,
    }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Retour à Explorer pour changer la sélection' }).click();

  // Back on Explorer with the same selection.
  await expect(page).toHaveURL(/\/explorer\?comparer=/);
  await expect(page.getByText(/À comparer \(2\/3\)/)).toBeVisible();
});

test('À propos, FAQ: one icon per question, « + » closed and « − » open', async ({ page }) => {
  await page.goto('/a-propos');
  // Icon's own inline-block used to beat `hidden`: both icons showed on every question
  for (const sel of ['details:not([open]) summary', 'details[open] summary']) {
    const summary = page.locator(sel).first();
    await expect(summary.locator('svg:visible')).toHaveCount(1);
  }
  const first = page.locator('details').first();
  await first.locator('summary').click();
  await expect(first).not.toHaveAttribute('open');
  await expect(first.locator('summary svg:visible')).toHaveCount(1);
});
