import { expect, test } from '@playwright/test';
import { waitForHydration } from './helpers';

test('explorer: filter "Alternance", pick 2 programs, open the comparator', async ({ page }) => {
  // Search, then filter (a work-study parcours of the Strasbourg area, tests/integration/fixtures).
  await page.goto('/explorer?q=Droit des affaires');
  await waitForHydration(page);
  const filters = page.getByRole('complementary', { name: 'Filtres' });
  await filters.getByRole('checkbox', { name: /^Alternance/ }).check();
  await expect(page).toHaveURL(/modalite=alternance/);
  await expect(page.getByRole('status').filter({ hasText: /parcours$/ })).toBeVisible();
  const card = (title: string) =>
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: title, exact: true }) });
  await card('Droit des affaires (fixtures)')
    .getByRole('button', { name: /^Comparer/ })
    .click();

  // Another search (the filters go), the selection stays.
  await page.goto('/explorer?q=Valorisation des nouveaux patrimoines');
  await waitForHydration(page);
  await card('Valorisation des nouveaux patrimoines')
    .getByRole('button', { name: /^Comparer/ })
    .click();
  const tray = page.getByText(/À comparer \(2\/3\)/);
  await expect(tray).toBeVisible();
  await page.getByRole('link', { name: 'Comparer (2)' }).click();

  await expect(page).toHaveURL(
    /\/comparer\?ids=it-droit-des-affaires-illkirch,valorisation-des-nouveaux-patrimoines/,
  );
  const table = page.getByRole('table', { name: 'Comparaison de parcours' });
  await expect(table.getByRole('link', { name: 'Droit des affaires (fixtures)' })).toBeVisible();
  await expect(table.getByRole('row', { name: /^Places/ })).toContainText('30');
  await expect(table.getByText('(meilleure valeur)').first()).toBeAttached();
});
