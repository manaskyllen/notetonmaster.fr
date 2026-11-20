import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { waitForHydration } from './helpers';
import { databaseUrl } from './stack';

/** Server pagination and Explorer facets. */

const list = (page: Page) =>
  page.getByRole('list', { name: 'Parcours de la page' }).getByRole('listitem');
const titleLink = (page: Page) => list(page).first().locator('a[href^="/parcours/"]');
const firstTitle = async (page: Page) => (await titleLink(page).textContent())?.trim();

test('Explorer: page 2 by the URL, back with the browser button', async ({ page }) => {
  await page.goto('/explorer');
  const p1 = await firstTitle(page);
  await page.goto('/explorer?page=2');
  await expect(page.getByText(/^25–48 sur/)).toBeVisible();
  const p2 = await firstTitle(page);
  expect(p2).not.toBe(p1);
  await expect(
    page.getByRole('navigation', { name: 'Pagination' }).locator('[aria-current="page"]').first(),
  ).toContainText('2');
  await page.goBack();
  await expect(page).toHaveURL(/\/explorer$/);
  expect(await firstTitle(page)).toBe(p1);
  // A page number links forward: page 3, then back to page 2.
  await page.goto('/explorer?page=2');
  await waitForHydration(page);
  await page
    .getByRole('navigation', { name: 'Pagination' })
    .getByRole('link', { name: 'Page 3', exact: true })
    .click();
  await expect(page).toHaveURL(/page=3/);
  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
});

test('Explorer: a filter goes back to page 1', async ({ page }) => {
  await page.goto('/explorer?page=3');
  await waitForHydration(page);
  const filters = page.getByRole('complementary', { name: 'Filtres' });
  await filters.getByRole('checkbox', { name: /^Alternance/ }).check();
  await expect(page).toHaveURL(/modalite=alternance/);
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.getByText(/^1–24 sur/)).toBeVisible();
  // The option keeps its counter, the active filter shows as a chip.
  await expect(page.getByRole('group', { name: 'Filtres actifs' })).toContainText('Alternance');
});

test('Explorer: the Compare selection survives a change of page', async ({ page }) => {
  await page.goto('/explorer');
  await waitForHydration(page);
  const card = list(page).first();
  const title = (await card.locator('a[href^="/parcours/"]').textContent())!.trim();
  await card.getByRole('button', { name: /^Comparer/ }).click();
  await expect(page.getByText('À comparer (1/3) :')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Pagination' })
    .getByRole('link', { name: /Suivant/ })
    .first()
    .click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/comparer=/);
  await expect(page.getByText('À comparer (1/3) :')).toBeVisible();
  await expect(
    page.getByRole('button', { name: `Retirer ${title} de la comparaison` }),
  ).toBeAttached();
});

test('Explorer: pagination works without JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/explorer');
  await page
    .getByRole('navigation', { name: 'Pagination' })
    .getByRole('link', { name: /Suivant/ })
    .first()
    .click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(/^25–48 sur/)).toBeVisible();
  await ctx.close();
});

test('Explorer on a phone (390 px): compact pagination, filter panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explorer');
  await waitForHydration(page);
  await expect(page.getByText(/^Page 1 sur \d+$/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const open = page.getByRole('button', { name: /^Filtres/ });
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  await open.click();
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  const sheet = page.getByRole('dialog', { name: 'Filtres' });
  await expect(sheet).toBeVisible();
  // Keyboard: focus stays in the panel (modal dialog).
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(await sheet.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await sheet.getByRole('checkbox', { name: /^M2/ }).check();
  await expect(page).toHaveURL(/entree=M2/);
  const see = sheet.getByRole('button', { name: /^Voir [\d\s ]+ parcours$/ });
  await expect(see).toBeVisible();
  await see.click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: 'Filtres (1)' })).toBeVisible();
});

test('reviews of a program: the overall rating does not change on page 2', async ({ page }) => {
  // 12 published reviews on one program, so that there is a page 2 (removed afterwards).
  const db = new pg.Client({ connectionString: databaseUrl() });
  await db.connect();
  const tag = `pg${Date.now()}`;
  const { rows } = await db.query<{ id: string; slug: string }>(
    `SELECT p.id, p.slug FROM "Program" p JOIN "ProgramSearchIndex" i ON i."programId" = p.id
      WHERE i."reviewCount" = 0 AND i."isPublicSector" ORDER BY p.id LIMIT 1`,
  );
  const prog = rows[0]!;
  try {
    for (let i = 0; i < 12; i++)
      await db.query(
        `INSERT INTO "Review" (id, ref, "programId", "authorEmailHash", level, "cohortYear", "overallRating",
                               pros, cons, status, "publishedAt", "submittedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'M2', 2024, $5, $6, $6, 'PUBLISHED', now() - ($7 || ' hours')::interval, now(), now())`,
        [
          `${tag}${i}`,
          `T${tag}${i}`.slice(0, 20),
          prog.id,
          `test:${tag}${i}`,
          (i % 5) + 1,
          'Un avis de test assez long pour passer la validation du formulaire.',
          String(i),
        ],
      );
    await page.goto(`/parcours/${prog.slug}`);
    const overall = page.getByTestId('overall-rating');
    const label = await overall.getAttribute('aria-label');
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible();
    await page.goto(`/parcours/${prog.slug}?page=2`);
    await expect(overall).toHaveAttribute('aria-label', label!);
    await expect(page.locator('[id^="T' + tag + '"]')).toHaveCount(2);
  } finally {
    await db.query(`DELETE FROM "Review" WHERE id LIKE $1`, [`${tag}%`]);
    await db.end();
  }
});

test('no axe violation on Explorer and on a paginated list', async ({ page }) => {
  for (const path of ['/explorer?modalite=alternance&page=2', '/?q=droit', '/mentions']) {
    await page.goto(path);
    await waitForHydration(page);
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('nextjs-portal')
      .analyze();
    expect(r.violations.map((v) => `${path} ${v.id}: ${v.help}`)).toEqual([]);
  }
});
