import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expireZonesCache, sql, waitForHydration } from './helpers';

/** /masters: the open cities (VillesIndex mockup). */

const cards = (page: Page) => page.locator('main li .vc');
const link = (page: Page) => page.locator('main li .vc a');
const status = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^[\d\s ]+ villes?( sur [\d\s ]+)?$/ });
const search = (page: Page) =>
  page.getByRole('searchbox', { name: 'Chercher une ville ou une région' });

type Zone = { slug: string; name: string; region: string | null; n: number; reviews: number };

/** The cities the page lists: open, with at least one published master. */
async function listed() {
  return sql<Zone>(
    `SELECT slug, name, region, "programCount" n, "reviewCount" reviews FROM "LaunchZone"
      WHERE open AND "programCount" > 0 ORDER BY "programCount" DESC, "order", name`,
  );
}

test('/masters: one card per open city, most masters first, the whole card a link', async ({
  page,
}) => {
  const zones = await listed();
  expect(!zones.length, 'fixtures: no open city').toBe(false);
  await page.goto('/masters');
  await waitForHydration(page);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Les masters par ville' }),
  ).toBeVisible();
  await expect(
    page.getByText(`${zones.length} villes ouvertes pour commencer. Choisis la tienne`),
  ).toBeVisible();
  await expect(status(page)).toHaveText(`${zones.length} ville${zones.length > 1 ? 's' : ''}`);
  await expect(cards(page)).toHaveCount(zones.length);
  // legend of the four domains
  await expect(
    page.getByRole('list', { name: 'Légende des domaines' }).getByRole('listitem'),
  ).toHaveCount(4);
  const first = cards(page).first();
  const z = zones[0]!;
  await expect(link(page).first()).toHaveAttribute('href', `/masters/${z.slug}`);
  await expect(link(page).first()).toHaveAttribute(
    'aria-label',
    new RegExp(`^Masters à ${z.name} : [\\d  ]+ parcours, \\d+ avis$`),
  );
  // the name alone, no « Masters à »
  await expect(first).not.toContainText('Masters à');
  await expect(first.getByRole('link')).toHaveCount(1);
  await expect(first).toContainText(z.name);
  if (z.region) await expect(first).toContainText(z.region.replace(/'/g, '’'));
  await expect(first).toContainText(/\d+ établissements? publics?/);
  await expect(
    first.getByRole('img', { name: /^Répartition par domaine : .+ \d+ %/ }),
  ).toBeVisible();
  const labels = await link(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label')!),
  );
  expect(labels.map((l) => /^Masters à (.+?) :/.exec(l)![1])).toEqual(zones.map((x) => x.name));
  // the whole card leads to the city: a click on its figures, far from the name
  await first.locator('p').click({ force: true });
  await expect(page).toHaveURL(new RegExp(`/masters/${z.slug}$`));
});

test('/masters: region, text and sort, kept in the address; unknown city', async ({ page }) => {
  const zones = await listed();
  const withRegion = zones.filter((z) => z.region);
  expect(withRegion.length < 2, 'fixtures: not enough cities').toBe(false);
  await page.goto('/masters');
  await waitForHydration(page);
  const region = withRegion.at(-1)!.region!;
  const label = region.replace(/'/g, '’');
  const inRegion = zones.filter((z) => z.region === region);
  await page.getByRole('combobox', { name: 'Région' }).selectOption({ label });
  await expect(page).toHaveURL(/region=/);
  await expect(cards(page)).toHaveCount(inRegion.length);
  await expect(status(page)).toHaveText(
    `${inRegion.length} ville${inRegion.length > 1 ? 's' : ''} sur ${zones.length}`,
  );
  // filtered pages: noindex, follow
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex, follow/);
  await expect(cards(page)).toHaveCount(inRegion.length);
  await page
    .getByRole('combobox', { name: 'Région' })
    .selectOption({ label: 'Toutes les régions' });
  await expect(cards(page)).toHaveCount(zones.length);

  // text: a city without its accents, or its region
  const target = zones.at(-1)!;
  await search(page).fill(target.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  await expect(page).toHaveURL(/q=/);
  await expect(cards(page).filter({ hasText: target.name })).toHaveCount(1);
  await search(page).fill(label.split(/[\s-]/)[0]!);
  for (const t of await cards(page).allTextContents())
    expect(t).toContain(label.split(/[\s-]/)[0]!);

  // sorts
  await search(page).fill('');
  const names = () =>
    link(page).evaluateAll((els) =>
      els.map((e) => /^Masters à (.+?) :/.exec(e.getAttribute('aria-label')!)![1]!),
    );
  await page.getByRole('combobox', { name: 'Trier par' }).selectOption('az');
  await expect(page).toHaveURL(/tri=az/);
  const az = await names();
  expect(az).toEqual([...az].sort((a, b) => a.localeCompare(b, 'fr')));
  await page.getByRole('combobox', { name: 'Trier par' }).selectOption('avis');
  const byReviews = [...zones].sort((a, b) => b.reviews - a.reviews || b.n - a.n);
  expect((await names())[0]).toBe(byReviews[0]!.name);
  await page.getByRole('combobox', { name: 'Trier par' }).selectOption('masters');
  await expect(page).not.toHaveURL(/tri=/);
  expect(await names()).toEqual(zones.map((z) => z.name));

  // a city not open yet: no list, the « not yet » message
  await search(page).fill('Quimperlé');
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByText('« Quimperlé » n’est pas encore sur')).toBeVisible();
  await expect(
    page.getByText(
      'On ouvre les villes petit à petit, pour avoir assez d’avis dans chacune avant de la mettre en ligne. La tienne arrive bientôt.',
    ),
  ).toBeVisible();
  // the dark box below, to the review form
  const box = page.getByRole('region', { name: 'Les autres villes' });
  await expect(box).toContainText('Ta ville n’est pas encore là ?');
  await expect(box.getByRole('link', { name: 'Donner mon avis' })).toHaveAttribute(
    'href',
    '/avis/nouveau',
  );
});

test('/masters: average from 3 reviews, the count below, « Pas encore d’avis » without', async ({
  page,
}) => {
  const zones = await listed();
  expect(zones.length < 3, 'fixtures: not enough cities').toBe(false);
  const saved = await sql<{ slug: string; reviewCount: number; avgRating: number | null }>(
    `SELECT slug, "reviewCount", "avgRating" FROM "LaunchZone" WHERE slug = ANY($1)`,
    [zones.slice(0, 3).map((z) => z.slug)],
  );
  const [a, b, c] = zones;
  // figures set by hand for the test (the columns the page reads), restored after
  await sql(
    `UPDATE "LaunchZone" SET "reviewCount" = v.n, "avgRating" = v.avg
       FROM (VALUES ($1, 5, 4.2::float), ($2, 2, 4.5::float), ($3, 0, NULL::float)) v(slug, n, avg)
      WHERE "LaunchZone".slug = v.slug`,
    [a!.slug, b!.slug, c!.slug],
  );
  await expireZonesCache(page);
  try {
    await page.goto('/masters');
    await waitForHydration(page);
    const card = (z: Zone) => cards(page).filter({ has: page.getByText(z.name, { exact: true }) });
    await expect(card(a!).getByRole('img', { name: 'Note moyenne : 4,2 sur 5' })).toBeVisible();
    await expect(card(a!)).toContainText('5 avis');
    await expect(card(b!).getByRole('img', { name: /Note moyenne/ })).toHaveCount(0);
    await expect(card(b!)).toContainText('2 avis');
    await expect(card(c!).getByRole('img', { name: /Note moyenne/ })).toHaveCount(0);
    await expect(card(c!)).toContainText('Pas encore d’avis');
  } finally {
    for (const s of saved)
      await sql(`UPDATE "LaunchZone" SET "reviewCount" = $2, "avgRating" = $3 WHERE slug = $1`, [
        s.slug,
        s.reviewCount,
        s.avgRating,
      ]);
    await expireZonesCache(page);
  }
});

test('/masters: an open city without any published master is not listed', async ({ page }) => {
  const empty = await sql<{ slug: string; name: string }>(
    `SELECT slug, name FROM "LaunchZone" WHERE NOT open AND "programCount" = 0
      AND name NOT IN (SELECT name FROM "LaunchZone" WHERE open) LIMIT 1`,
  );
  expect(!empty.length, 'fixtures: no closed city to open').toBe(false);
  const z = empty[0]!;
  // opened by hand, its parcours not indexed: 0 published master
  await sql(`UPDATE "LaunchZone" SET open = true WHERE slug = $1`, [z.slug]);
  await expireZonesCache(page);
  try {
    await page.goto('/masters');
    await waitForHydration(page);
    await expect(cards(page).first()).toBeVisible();
    await expect(page.locator(`main a[href="/masters/${z.slug}"]`)).toHaveCount(0);
    await expect(status(page)).toHaveText(/^\d+ villes?$/);
  } finally {
    await sql(`UPDATE "LaunchZone" SET open = false WHERE slug = $1`, [z.slug]);
    await expireZonesCache(page);
  }
});

test('the old address of Montbéliard answers with a 301', async ({ page }) => {
  const r = await page.request.get('/masters/montbeliar', { maxRedirects: 0 });
  expect(r.status()).toBe(301);
  expect(r.headers().location).toMatch(/\/masters\/montbeliard$/);
});

test('no serious axe violation on /masters', async ({ page }) => {
  await page.goto('/masters');
  await waitForHydration(page);
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('nextjs-portal')
    .analyze();
  expect(
    r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
});
