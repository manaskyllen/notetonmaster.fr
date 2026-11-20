import { expect, test } from '@playwright/test';
import { waitForHydration } from './helpers';

test('search "patrimoine nantes" on the home page, then open the program', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  await page.getByRole('combobox', { name: 'Quoi ?' }).fill('PATRIMOINE   nantés');
  // the suggestions, grouped; the master found leads to its fiche
  const masters = page.getByRole('group', { name: 'Masters' });
  await expect(
    masters.getByRole('option', { name: /Valorisation des nouveaux patrimoines/ }),
  ).toBeVisible();
  await expect(masters.getByRole('option', { name: /Événementiel/ })).toHaveCount(0);
  await masters.getByRole('option', { name: /Valorisation des nouveaux patrimoines/ }).click();
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

test('search by RNCP number: suggestions show « Trouvé par RNCP · RNCP42684 »', async ({
  page,
}) => {
  await page.goto('/');
  await waitForHydration(page);
  const q = page.getByRole('combobox', { name: 'Quoi ?' });
  const masters = page.getByRole('group', { name: 'Masters' });
  await q.fill('RNCP42684');
  const row = masters.getByRole('option', { name: /Valorisation des nouveaux patrimoines/ });
  await expect(row).toBeVisible();
  await expect(row.getByText('Trouvé par RNCP · RNCP42684')).toBeVisible();
  // Written another way, and by Mon Master number.
  await q.fill('rncp 42684');
  await expect(masters.getByText('Trouvé par RNCP · RNCP42684').first()).toBeVisible();
  await q.fill('2500101KDKQN');
  await expect(masters.getByRole('option')).toHaveCount(1);
  await expect(masters.getByText('Trouvé par Mon Master · 2500101KDKQN')).toBeVisible();
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

  // Home page: « Quoi ? » of the guided search.
  await page.goto('/');
  await waitForHydration(page);
  const hero = page.getByRole('combobox', { name: 'Quoi ?' });
  await expect(async () => {
    // A page inside a loading boundary hydrates after the root: a first press may still
    // open the palette. Close it and press again.
    if (await palette.isVisible()) await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await expect(hero).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(palette).toBeHidden();
});
