import { expect, test } from '@playwright/test';
import { waitForHydration } from './helpers';

test('search "patrimoine nantes" on the home page, then open the program', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.getByRole('searchbox', { name: /Rechercher un master/ }).fill('PATRIMOINE   nantés');
  // the search is applied after a short debounce (address, then list): until then the home
  // lists the whole catalogue, where this parcours may already be first, and a click on it
  // would be lost when the list is replaced
  await expect(page).toHaveURL(/[?&]q=PATRIMOINE/);
  const results = page.getByRole('region', { name: 'Résultats de recherche' });
  await expect(
    results.getByRole('heading', { name: /^Résultats pour « PATRIMOINE/ }),
  ).toBeAttached();
  await expect(
    results.getByRole('link', { name: /Valorisation des nouveaux patrimoines/ }),
  ).toBeVisible();
  await expect(results.getByRole('link', { name: /Événementiel/ })).toHaveCount(0);
  await results.getByRole('link', { name: /Valorisation des nouveaux patrimoines/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Valorisation des nouveaux patrimoines' }),
  ).toBeVisible();
  // the Admission tab (the reviews come first): no figure cards,
  // « D'où viennent les admis ? » first, with its source
  await waitForHydration(page);
  await page.getByRole('tab', { name: 'Admission' }).click();
  const origins = page.locator('section[aria-labelledby="ao-title"]');
  await expect(origins.getByRole('heading', { name: 'D’où viennent les admis ?' })).toBeVisible();
  await expect(origins.getByText(/18 admis/)).toBeVisible();
  await expect(
    origins.getByText(/Source : Mon Master, données ouvertes du ministère/),
  ).toBeVisible();
  await expect(page).toHaveTitle(
    // lib/seo/titles.ts: the whole parcours name and the city fit, « Nantes Université » does not
    'Master Valorisation des nouveaux patrimoines – Nantes | notetonmaster',
  );
});

test('search by RNCP number: results show « Trouvé par RNCP · RNCP42684 »', async ({ page }) => {
  await page.goto('/?q=RNCP42684');
  const results = page.getByRole('region', { name: 'Résultats de recherche' });
  const row = results.getByRole('link', { name: /Valorisation des nouveaux patrimoines/ });
  await expect(row).toBeVisible();
  await expect(row.getByText('Trouvé par RNCP · RNCP42684')).toBeVisible();
  // Written another way, and by Mon Master number.
  await page.goto('/?q=rncp%2042684');
  await expect(results.getByText('Trouvé par RNCP · RNCP42684').first()).toBeVisible();
  await page.goto('/?q=2500101KDKQN');
  await expect(results.getByRole('listitem').getByRole('link')).toHaveCount(1);
  await expect(results.getByText('Trouvé par Mon Master · 2500101KDKQN')).toBeVisible();
});

test('⌘K: palette on a fiche, the page field on Explorer and the home page', async ({ page }) => {
  await page.goto('/parcours/histoire-de-l-art-et-culture-materielle');
  const pill = page.getByRole('button', { name: /Rechercher un master/ });
  const palette = page.getByRole('dialog', { name: 'Recherche et navigation' });
  await expect(pill).toHaveAttribute('aria-keyshortcuts', 'Meta+K Control+K');
  // Ctrl+K opens the palette (pressed again until the page is hydrated).
  await expect(async () => {
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(palette.getByRole('group', { name: 'Aller à' })).toBeVisible();
  // Escape closes it and gives focus back to the pill.
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(pill).toBeFocused();
  // Meta+K (Mac) opens it too; a Mon Master number and Enter lead to a fiche.
  await page.keyboard.press('Meta+k');
  const input = palette.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('2500101');
  const masters = palette.getByRole('group', { name: 'Masters' });
  await expect(masters.getByRole('option').first()).toBeVisible();
  await expect(masters.getByText(/Mon Master · 2500101/).first()).toBeVisible();
  const first = (await masters.getByRole('option').first().getAttribute('href'))!;
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${first}$`));
  await expect(palette).toBeHidden();

  // Explorer: Ctrl+K only puts the cursor in the catalogue filter.
  await page.goto('/explorer');
  await waitForHydration(page);
  const filter = page.getByRole('searchbox', { name: 'Mot-clé' });
  await expect(async () => {
    // A page inside a loading boundary hydrates after the root: a first press may still
    // open the palette. Close it and press again.
    if (await palette.isVisible()) await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await expect(filter).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(palette).toBeHidden();

  // Home page: the hero bar.
  await page.goto('/');
  await waitForHydration(page);
  const hero = page.getByRole('searchbox', { name: /Rechercher un master/ });
  await expect(async () => {
    // A page inside a loading boundary hydrates after the root: a first press may still
    // open the palette. Close it and press again.
    if (await palette.isVisible()) await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await expect(hero).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(palette).toBeHidden();
});
