import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { animationsDone, expireTags, sql, waitForHydration } from './helpers';

/**
 * Home (MainV2): the guided search « Quoi ? / Où ? », its suggestions and keyboard, the quick
 * filters and the count, the form without JavaScript, the latest reviews (from 3), the domains.
 * Open cities of the fixtures: Strasbourg, Mulhouse, Nantes.
 */

const quoi = (page: Page) => page.getByRole('combobox', { name: 'Quoi ?' });
const ou = (page: Page) => page.getByRole('button', { name: /^Où \?/ });
const submit = (page: Page) =>
  page.getByRole('search', { name: 'Chercher un master' }).locator('button[type=submit].go');

async function home(page: Page) {
  await page.goto('/');
  await waitForHydration(page);
}

test('suggestions: grouped, the words marked, identifiers, then a click opens the fiche', async ({
  page,
}) => {
  await home(page);
  await quoi(page).fill('patrimoine');
  const list = page.getByRole('listbox', { name: 'Suggestions' });
  await expect(list.getByRole('group', { name: 'Recherche' })).toContainText(
    /Voir les? .*pour « patrimoine »/,
  );
  await expect(list.getByRole('group', { name: 'Disciplines' })).toBeVisible();
  const masters = list.getByRole('group', { name: 'Masters' });
  await expect(masters.getByRole('option').first()).toBeVisible();
  // the word typed is marked, accents and case aside
  await quoi(page).fill('PATRIMOINES');
  await expect(masters.locator('mark').first()).toHaveText(/patrimoines/i);
  // the live region counts the suggestions
  await expect(page.getByRole('status').filter({ hasText: /suggestions?\./ })).toBeAttached();
  await masters.getByRole('option').first().click();
  await expect(page).toHaveURL(/\/parcours\//);
});

test('keyboard: ↓ ↑ loop, Enter opens, Escape closes', async ({ page }) => {
  await home(page);
  const q = quoi(page);
  await q.focus();
  // empty field: the frequent searches
  const frequent = page.getByRole('group', { name: 'Recherches fréquentes' }).getByRole('option');
  await expect(frequent.first()).toBeVisible();
  const n = await frequent.count();
  expect(n).toBeGreaterThan(1);
  const active = () => q.getAttribute('aria-activedescendant');
  const first = await active();
  await page.keyboard.press('ArrowDown');
  expect(await active()).not.toBe(first);
  await page.keyboard.press('ArrowUp');
  expect(await active()).toBe(first);
  await page.keyboard.press('ArrowUp'); // loops to the last one
  expect(await active()).toBe(await frequent.last().getAttribute('id'));
  // Enter on a frequent search fills the field with it
  const label = (await frequent.last().textContent())!;
  await page.keyboard.press('Enter');
  await expect(q).not.toHaveValue('');
  expect(label).toContain(await q.inputValue());
  await page.keyboard.press('Escape');
  await expect(q).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('listbox', { name: 'Suggestions' })).toHaveCount(0);
  // Enter on the first suggestion (« Voir les n masters pour… ») leads to the Explorer
  await q.fill('patrimoine');
  await expect(page.getByRole('group', { name: 'Recherche' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/explorer\?q=patrimoine$/);
});

test('an open city typed in « Quoi ? » fills « Où ? »; a closed one; nothing found', async ({
  page,
}) => {
  await home(page);
  await quoi(page).fill('nantes');
  const cities = page.getByRole('group', { name: 'Villes' });
  await expect(cities.getByRole('option', { name: /Masters à Nantes/ })).toBeVisible();
  // a city typed: no « Voir les n masters pour « nantes » »
  await expect(page.getByRole('group', { name: 'Recherche' })).toHaveCount(0);
  await cities.getByRole('option', { name: /Masters à Nantes/ }).click();
  await expect(ou(page)).toHaveAccessibleName('Où ? Nantes');
  await expect(quoi(page)).toHaveValue('');

  await quoi(page).fill('Versailles');
  await expect(page.getByText('Versailles n’est pas encore sur notetonmaster')).toBeVisible();
  await expect(page.getByText(/On préfère ouvrir moins de villes/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Masters à / })).toHaveCount(3);

  await quoi(page).fill('zzqqxx');
  await expect(page.getByText('Rien pour « zzqqxx »… pour l’instant')).toBeVisible();
  await expect(page.getByText('Essaie un mot plus court ou une discipline :')).toBeVisible();
  await expect(submit(page)).toHaveText('Chercher');
});

test('« Où ? »: the city picker of /mentions, the line of the open cities', async ({ page }) => {
  await home(page);
  await ou(page).click();
  const dialog = page.getByRole('dialog', { name: 'Choisir une ville' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('3 villes ouvertes · on ouvre les suivantes petit à petit');
  const field = dialog.getByRole('combobox', { name: 'Chercher une ville' });
  await field.fill('Lyonnzz');
  await expect(dialog).toContainText('Pas encore de masters à « Lyonnzz »');
  await field.fill('STRAS');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(ou(page)).toHaveAccessibleName('Où ? Strasbourg');
  // « Effacer », then a city of the line
  await page.getByRole('button', { name: 'Retirer le filtre de ville' }).click();
  await expect(ou(page)).toHaveAccessibleName('Où ? Toutes les villes');
  await page
    .getByRole('group', { name: 'Villes ouvertes' })
    .getByRole('button', { name: 'Choisir Mulhouse' })
    .click();
  await expect(ou(page)).toHaveAccessibleName('Où ? Mulhouse');
  // the domains follow the city
  await expect(page.getByText('Mentions ouvertes à Mulhouse')).toBeVisible();
  // opening « Où ? » closes the suggestions, and the other way round
  await quoi(page).fill('droit');
  await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible();
  await ou(page).click();
  await expect(page.getByRole('listbox', { name: 'Suggestions' })).toHaveCount(0);
  await quoi(page).click();
  await expect(dialog).toBeHidden();
});

test('quick filters and count: nothing moves, the Explorer gets the same parameters', async ({
  page,
}) => {
  await home(page);
  const boxes = async () =>
    Promise.all([quoi(page).boundingBox(), ou(page).boundingBox(), submit(page).boundingBox()]);
  const before = await boxes();
  const label = await submit(page).textContent();
  expect(label).toMatch(/^Voir les? /);
  const m1 = page.getByRole('button', { name: 'Accessibles après la licence', pressed: false });
  await m1.click();
  await expect(
    page.getByRole('button', { name: 'Accessibles après la licence', pressed: true }),
  ).toBeVisible();
  await expect(submit(page)).not.toHaveText(label!);
  expect(await boxes()).toEqual(before);
  await page.getByRole('button', { name: 'Avec des avis' }).click();
  expect(await boxes()).toEqual(before);
  // « Plus de filtres » keeps them
  await expect(page.getByRole('link', { name: 'Plus de filtres →' })).toHaveAttribute(
    'href',
    '/explorer?avis=avec&entree=M1',
  );
  await ou(page).click();
  await page.getByRole('option', { name: /^Nantes/ }).click();
  await quoi(page).fill('patrimoine');
  await page.keyboard.press('Escape');
  await submit(page).click();
  await expect(page).toHaveURL(/\/explorer\?q=patrimoine&lieu=zone%3Anantes&avis=avec&entree=M1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Explorer les masters' })).toBeVisible();
});

test('without JavaScript: a plain form to the Explorer', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Quoi ?' }).fill('patrimoine');
  await page.getByRole('combobox', { name: 'Où ?' }).selectOption({ label: 'Nantes' });
  await page.getByRole('checkbox', { name: 'En alternance' }).check();
  await page.getByRole('button', { name: /^Voir les? |^Chercher/ }).click();
  await expect(page).toHaveURL(/\/explorer\?q=patrimoine&lieu=zone%3Anantes&modalite=alternance$/);
  // a city of the line: the Explorer of that city
  await page.goto('/');
  await page.getByRole('button', { name: 'Choisir Strasbourg' }).click();
  await expect(page).toHaveURL(/\/explorer\?.*lieu=zone%3Astrasbourg/);
  await ctx.close();
});

test.describe('latest reviews', () => {
  async function withPublished(page: Page, n: number, check: () => Promise<void>) {
    // the production build counts real reviews only (demo ones left out, as in the footer):
    // keep n real ones, hide every other
    const rows = await sql<{ id: string }>(
      `SELECT id FROM "Review" WHERE status = 'PUBLISHED' ORDER BY "isDemo", "publishedAt" DESC, id`,
    );
    const hide = rows.slice(n).map((r) => r.id);
    await sql(`UPDATE "Review" SET status = 'HIDDEN' WHERE id = ANY($1)`, [hide]);
    await expireTags(page, ['reviews']);
    try {
      await check();
    } finally {
      await sql(`UPDATE "Review" SET status = 'PUBLISHED' WHERE id = ANY($1)`, [hide]);
      await expireTags(page, ['reviews']);
    }
  }
  const section = (page: Page) =>
    page.getByRole('region', { name: 'Ce qu’en disent les étudiant·es' });

  test('3 published: the section, three cards to the fiches', async ({ page }) => {
    await withPublished(page, 3, async () => {
      await page.goto('/');
      await expect(section(page).getByRole('article')).toHaveCount(3);
      await expect(section(page).getByRole('link').first()).toHaveAttribute(
        'href',
        /^\/parcours\/[^#]+#avis$/,
      );
      await expect(page.getByRole('heading', { name: /Aide la promo d’après/ })).toBeVisible();
      await expect(page.getByText('Les premiers avis arrivent')).toHaveCount(0);
    });
  });

  test('2 published: no section, the usual call', async ({ page }) => {
    await withPublished(page, 2, async () => {
      await page.goto('/');
      await expect(section(page)).toHaveCount(0);
      await expect(page.getByText('Les premiers avis arrivent')).toHaveCount(0);
    });
  });

  test('none: « Les premiers avis arrivent », naming the open cities', async ({ page }) => {
    await withPublished(page, 0, async () => {
      await page.goto('/');
      await expect(section(page)).toHaveCount(0);
      await expect(page.getByText('Les premiers avis arrivent')).toBeVisible();
      await expect(page.getByText(/Tu as fait ton master à .+ ou .+ \?/)).toBeVisible();
      await expect(page.getByRole('link', { name: /Donner le premier avis/ })).toHaveAttribute(
        'href',
        '/avis/nouveau',
      );
    });
  });
});

test('a domain without any mention: « Bientôt », not a link', async ({ page }) => {
  const domain = 'arts-lettres-langues';
  const rows = await sql<{ programId: string }>(
    `SELECT "programId" FROM "ProgramSearchIndex" WHERE "domainSlug" = $1`,
    [domain],
  );
  const ids = rows.map((r) => r.programId);
  await sql(
    `UPDATE "ProgramSearchIndex" SET "domainSlug" = 'droit-economie-gestion' WHERE "programId" = ANY($1)`,
    [ids],
  );
  await expireTags(page, ['catalog']);
  try {
    await page.goto('/');
    const tiles = page.getByRole('region', { name: 'Explorer par domaine' });
    await expect(tiles.getByRole('link', { name: /^Arts, lettres, langues/ })).toHaveCount(0);
    await expect(tiles.getByText(/Arts, lettres, langues : bientôt/)).toBeAttached();
    await expect(
      tiles.getByRole('link', { name: /^Droit, économie, gestion : \d+ mentions?/ }),
    ).toHaveAttribute('href', '/mentions?domaine=droit-economie-gestion');
  } finally {
    await sql(`UPDATE "ProgramSearchIndex" SET "domainSlug" = $1 WHERE "programId" = ANY($2)`, [
      domain,
      ids,
    ]);
    await expireTags(page, ['catalog']);
  }
});

for (const scheme of ['light', 'dark'] as const)
  test(`axe (${scheme}), suggestions open`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await home(page);
    await quoi(page).fill('patrimoine');
    await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible();
    await animationsDone(page);
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('nextjs-portal')
      .analyze();
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
  });

for (const width of [320, 390, 1440])
  test(`no horizontal scroll at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await home(page);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over).toBe(0);
  });

test('SEO: one h1, indexable bare, noindex with parameters, canonical without them', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await page.goto('/?q=droit&ville=nantes');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/);
  await expect(quoi(page)).toHaveValue('droit');
  await expect(ou(page)).toHaveAccessibleName('Où ? Nantes');
});
