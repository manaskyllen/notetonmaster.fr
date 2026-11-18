import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sql, waitForHydration } from './helpers';

/** /universites. */

const cards = (page: Page) => page.locator('main li.ix-card');
const status = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^[\d\s ]+ établissements?( sur [\d\s ]+)?$/ });

/** Public establishments with a published master in an open city, by kind. */
async function published() {
  return sql<{ slug: string; name: string; kind: string; zones: string[] }>(
    `SELECT u.slug, u.name, min(i.kind) kind, array_agg(DISTINCT z.name) zones
       FROM "ProgramSearchIndex" i JOIN "University" u ON u.id = i."universityId"
       JOIN "LaunchZone" z ON z.open AND z.slug = ANY(i."zoneSlugs")
      WHERE i."isPublicSector" GROUP BY u.id`,
  );
}

test('/universites: one grid of the published establishments, no section per city', async ({
  page,
}) => {
  const rows = await published();
  await page.goto('/universites');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Les universités' })).toBeVisible();
  await expect(status(page)).toHaveText(
    `${rows.length} établissement${rows.length > 1 ? 's' : ''}`,
  );
  await expect(cards(page)).toHaveCount(rows.length);
  // nothing out of the open cities: exactly the establishments of the index
  const names = await cards(page).evaluateAll((els) =>
    els.map((e) => e.querySelector('a')!.textContent!),
  );
  expect([...names].sort()).toEqual(rows.map((r) => r.name).sort());
  // no heading per city, no « go to the city » shortcuts
  await expect(page.locator('main h2')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: /ville/i })).toHaveCount(0);
  // « Plus de masters » by default
  const masters = await cards(page).evaluateAll((els) =>
    els.map((e) => Number(e.querySelector('.border-t strong')!.textContent!.replace(/\D/g, ''))),
  );
  expect(masters).toEqual([...masters].sort((a, b) => b - a));
  // a card: its tile, its name as the link, its city and kind, figures and rating
  const first = cards(page).first();
  await expect(first.getByRole('link')).toHaveAccessibleName(names[0]!);
  await expect(first).toContainText(/· (Université|École ou institut)/);
  await expect(first).toContainText(/\d+ masters? · \d+ mentions?/);
  await expect(first).toContainText(/\d avis|Pas encore d’avis/);
  await expect(
    page.getByText(/^Établissements publics ayant au moins un master publié/),
  ).toBeVisible();
});

test('/universites: kind, city and text combined; « Mieux notées »; empty state', async ({
  page,
}) => {
  const rows = await published();
  const univ = rows.filter((r) => r.kind === 'UNIVERSITY');
  test.skip(!univ.length, 'no university');
  const city = univ[0]!.zones[0]!;
  await page.goto('/universites');
  await waitForHydration(page);
  const kind = page.getByRole('button', { name: /^Universités/ });
  await kind.click();
  await expect(kind).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Tous/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: /^Ville/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Choisir une ville' });
  await expect(dialog.getByRole('option').nth(1)).toHaveText(/\d+ établissements?/);
  await dialog.getByRole('option', { name: new RegExp(`^${city}`) }).click();
  await expect(page).toHaveURL(/type=univ/);
  await expect(page).toHaveURL(/ville=/);
  const expected = univ.filter((r) => r.zones.includes(city));
  await expect(cards(page)).toHaveCount(expected.length);
  await expect(status(page)).toHaveText(
    `${expected.length} établissement${expected.length > 1 ? 's' : ''} sur ${rows.length}`,
  );
  for (const t of await cards(page).allTextContents()) {
    expect(t).toContain('· Université');
    // the filtered city is named first
    expect(t).toMatch(new RegExp(`${city}(,| et| ·)`));
  }
  // text: the name of one of them, without its accents
  const one = expected[0]!.name;
  const word = one
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .sort((a, b) => b.length - a.length)[0]!;
  await page
    .getByRole('searchbox', { name: 'Filtrer les établissements' })
    .fill(word.toLowerCase());
  await expect(cards(page).filter({ hasText: one })).toHaveCount(1);
  // « Mieux notées »: rated first, without reviews last
  await page.getByRole('button', { name: 'Retirer le filtre de ville' }).click();
  await page.getByRole('searchbox', { name: 'Filtrer les établissements' }).fill('');
  await page.getByRole('combobox', { name: 'Trier par' }).selectOption('note');
  await expect(page).toHaveURL(/tri=note/);
  const notes = await cards(page).evaluateAll((els) =>
    els.map((e) => {
      const img = e.querySelector('[role="img"]');
      return img
        ? Number(
            img
              .getAttribute('aria-label')!
              .match(/([\d,]+) sur 5/)![1]!
              .replace(',', '.'),
          )
        : null;
    }),
  );
  const firstNone = notes.indexOf(null);
  if (firstNone >= 0) expect(notes.slice(firstNone).every((x) => x === null)).toBe(true);
  const rated = notes.filter((x): x is number => x !== null);
  expect(rated).toEqual([...rated].sort((a, b) => b - a));
  // nothing left: the empty state clears the filters
  await page.getByRole('searchbox', { name: 'Filtrer les établissements' }).fill('zzzzqx');
  await expect(page.getByText('Aucun établissement avec ces filtres')).toBeVisible();
  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  await expect(cards(page)).toHaveCount(rows.length);
});

test('the footer and the breadcrumbs lead to the indexes', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'Les mentions' })).toHaveAttribute(
    'href',
    '/mentions',
  );
  await expect(footer.getByRole('link', { name: 'Les universités' })).toHaveAttribute(
    'href',
    '/universites',
  );
  const [u] = await published();
  test.skip(!u, 'no establishment');
  await page.goto(`/universites/${u!.slug}`);
  await expect(
    page
      .getByRole('navigation', { name: /fil d’ariane/i })
      .getByRole('link', { name: 'Universités' }),
  ).toHaveAttribute('href', '/universites');
});

test('no serious axe violation on /universites', async ({ page }) => {
  await page.goto('/universites');
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
