import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { sql, waitForHydration } from './helpers';

/** Landing pages by city (/masters/{ville}, /masters/{ville}/{mention}) and their links. */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The most furnished open city, and its most furnished mention with at least 2 parcours. */
async function cityAndMention() {
  const [row] = await sql<{
    city: string;
    name: string;
    mention: string;
    mname: string;
    n: number;
  }>(
    `SELECT z.slug city, z.name, i."mentionSlug" mention, min(i."mentionName") mname, count(*)::int n
       FROM "ProgramSearchIndex" i JOIN "LaunchZone" z ON z.open AND z.slug = ANY(i."zoneSlugs")
      WHERE i."isPublicSector" GROUP BY 1, 2, 3 HAVING count(*) >= 2 ORDER BY 5 DESC, 1, 3 LIMIT 1`,
  );
  return row;
}

test('a city page: one h1, its mentions, its establishments, and a breadcrumb in JSON-LD', async ({
  page,
}) => {
  const c = await cityAndMention();
  test.skip(!c, 'no open city with 2 parcours of one mention');
  await page.goto(`/masters/${c!.city}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Les masters à ${c!.name}`);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(
    page.getByText(/^[\d\s ]+ parcours dans \d+ établissements? publics?, /),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: new RegExp(`^${escapeRe(c!.mname)}`) }),
  ).toHaveAttribute('href', `/masters/${c!.city}/${c!.mention}`);
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.some((t) => t.includes('"BreadcrumbList"'))).toBe(true);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`/masters/${c!.city}$`),
  );
});

test('a city × mention page lists its parcours and leads back to the mention', async ({ page }) => {
  const c = await cityAndMention();
  test.skip(!c, 'no open city with 2 parcours of one mention');
  await page.goto(`/masters/${c!.city}/${c!.mention}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`à ${c!.name}`);
  // the same list as a mention page: 20 per page
  await expect(page.locator('main li.nm-followcard')).toHaveCount(Math.min(c!.n, 20));
  // the page's own link (the footer has one to /masters too)
  await expect(
    page.locator('main').getByRole('link', { name: 'Toutes les villes →' }),
  ).toHaveAttribute('href', `/mentions/${c!.mention}`);
  // the fiche of one of its parcours has the city then the city × mention page in its breadcrumb
  await page.locator('main li.nm-followcard a[href^="/parcours/"]').first().click();
  const crumbs = page.getByRole('navigation', { name: 'Fil d’Ariane' });
  await expect(crumbs.getByRole('link', { name: c!.name })).toHaveAttribute(
    'href',
    `/masters/${c!.city}`,
  );
  await expect(crumbs.getByRole('link', { name: c!.mname })).toHaveAttribute(
    'href',
    `/masters/${c!.city}/${c!.mention}`,
  );
});

test('the footer lists the open cities; a closed or unknown city answers 404', async ({ page }) => {
  const c = await cityAndMention();
  test.skip(!c, 'no open city');
  await page.goto('/');
  await expect(
    page.locator('footer').getByRole('link', { name: `Masters à ${c!.name}` }),
  ).toHaveAttribute('href', `/masters/${c!.city}`);
  const closed = await sql<{ slug: string }>(
    `SELECT slug FROM "LaunchZone" WHERE NOT open LIMIT 1`,
  );
  for (const slug of [closed[0]?.slug ?? 'ville-fermee', 'ville-inconnue']) {
    const r = await page.request.get(`/masters/${slug}`);
    expect(r.status(), slug).toBe(404);
  }
  expect((await page.request.get(`/masters/${c!.city}/mention-inconnue`)).status()).toBe(404);
});

test('no serious axe violation on a city page and a city × mention page', async ({ page }) => {
  const c = await cityAndMention();
  test.skip(!c, 'no open city');
  for (const path of [`/masters/${c!.city}`, `/masters/${c!.city}/${c!.mention}`]) {
    await page.goto(path);
    await waitForHydration(page);
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      path,
    ).toEqual([]);
  }
});
