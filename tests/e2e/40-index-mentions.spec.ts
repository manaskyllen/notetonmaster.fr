import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expireZonesCache, sql, waitForHydration } from './helpers';

/** /mentions and the city picker. */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Mentions that have a published parcours in an open city (the perimeter of the page). */
async function published() {
  const [{ n }] = (await sql<{ n: number }>(
    `SELECT count(DISTINCT i."mentionId")::int n FROM "ProgramSearchIndex" i
      WHERE i."isPublicSector"
        AND i."zoneSlugs" && ARRAY(SELECT slug FROM "LaunchZone" WHERE open)`,
  )) as [{ n: number }];
  return n;
}

async function openZones() {
  return sql<{ slug: string; name: string }>(
    `SELECT DISTINCT z.slug, z.name FROM "LaunchZone" z
       JOIN "ProgramSearchIndex" i ON z.slug = ANY(i."zoneSlugs") AND i."isPublicSector"
      WHERE z.open ORDER BY z.name`,
  );
}

const status = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^[\d\s\u202f]+ mentions?( sur [\d\s\u202f]+)?$/ });
const cards = (page: Page) => page.locator('main li.ix-card');

test('/mentions: every published mention on one page, by letter, no letter bar, no pagination', async ({
  page,
}) => {
  await page.goto('/mentions?page=3');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Les mentions' })).toBeVisible();
  await expect(page.getByText(/La mention, c’est le nom officiel du diplôme\./)).toBeVisible();
  const n = await published();
  await expect(status(page)).toHaveText(`${n.toLocaleString('fr-FR')} mentions`);
  await expect(cards(page)).toHaveCount(n);
  // no letter bar A to Z, no letter filter, no pagination
  await expect(page.getByRole('navigation', { name: 'Lettres' })).toHaveCount(0);
  await expect(page.locator('a[href*="#lettre-"]')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Pagination' })).toHaveCount(0);
  // every card under the letter of its name, accents ignored (« Économie » under E)
  const groups = await page.locator('main section[aria-label^="Lettre "]').evaluateAll((els) =>
    els.map((s) => ({
      letter: s.getAttribute('aria-label')!.slice(-1),
      names: Array.from(s.querySelectorAll('li.ix-card a')).map((a) => a.textContent!),
    })),
  );
  expect(groups.map((g) => g.letter)).toEqual([...groups.map((g) => g.letter)].sort());
  for (const g of groups)
    for (const name of g.names)
      expect(
        norm(name)
          .replace(/^[^a-z0-9]+/, '')
          .charAt(0)
          .toUpperCase(),
      ).toBe(g.letter);
  // no icon or « MENTION » badge on the cards: the name is the accessible name of the link
  const first = cards(page).first();
  await expect(first.getByRole('link')).toHaveCount(1);
  await expect(first.getByRole('link')).toHaveAccessibleName(groups[0]!.names[0]!);
  await expect(first.getByText('MENTION', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(/^Seules les mentions qui ont au moins un parcours publié/),
  ).toBeVisible();
});

test('/mentions: domain, city and text combined, kept in the address; empty state', async ({
  page,
}) => {
  const zones = await openZones();
  expect(!zones.length, 'fixtures: no open city').toBe(false);
  await page.goto('/mentions');
  await waitForHydration(page);
  const total = await cards(page).count();
  const tile = page.getByRole('button', { name: /^Droit, économie, gestion/ });
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Tous les domaines/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page).toHaveURL(/domaine=droit-economie-gestion/);
  // an open city with at least one mention of the domain
  const [found] = await sql<{ slug: string; name: string }>(
    `SELECT DISTINCT z.slug, z.name FROM "LaunchZone" z
       JOIN "ProgramSearchIndex" i ON z.slug = ANY(i."zoneSlugs") AND i."isPublicSector"
       JOIN "Mention" m ON m.id = i."mentionId"
       JOIN "Domain" d ON d.id = m."domainId" AND d.slug = 'droit-economie-gestion'
      WHERE z.open ORDER BY z.name LIMIT 1`,
  );
  expect(!found, 'fixtures: no mention of the domain in an open city').toBe(false);
  const city = found!;
  await page.getByRole('button', { name: /^Ville/ }).click();
  await page.getByRole('option', { name: new RegExp(`^${city.name}`) }).click();
  await expect(page).toHaveURL(new RegExp(`ville=${city.slug}`));
  const shown = await cards(page).count();
  expect(shown).toBeGreaterThan(0);
  await expect(status(page)).toHaveText(`${shown} mention${shown > 1 ? 's' : ''} sur ${total}`);
  // every card: of the domain, taught in the city, the city named first
  for (const t of await cards(page).evaluateAll((els) => els.map((e) => e.textContent ?? '')))
    expect(t).toMatch(new RegExp(`^Droit, économie, gestion.*parcours · ${city.name}`));
  // the filtered city goes with the link: the mention page opens on it
  await expect(cards(page).first().getByRole('link')).toHaveAttribute(
    'href',
    new RegExp(`\\?lieu=zone%3A${city.slug}$`),
  );
  // text on top: every word, accents ignored
  const name = (await cards(page).first().getByRole('link').textContent())!;
  const word =
    norm(name)
      .split(/[^a-z]+/)
      .find((w) => w.length > 3) ?? norm(name);
  await page.getByRole('searchbox', { name: 'Filtrer les mentions' }).fill(word.toUpperCase());
  await expect(page).toHaveURL(new RegExp(`q=${word.toUpperCase()}`));
  for (const n of await cards(page).evaluateAll((els) =>
    els.map((e) => e.querySelector('a')!.textContent!),
  ))
    expect(norm(n)).toContain(word);
  // the state comes back from the address
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByRole('button', { name: /^Droit, économie/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: new RegExp(`^Ville ${city.name}`) })).toBeVisible();
  // nothing left: the empty state clears every filter
  await page.getByRole('searchbox', { name: 'Filtrer les mentions' }).fill('zzzzqx');
  await expect(page.getByText('Aucune mention avec ces filtres')).toBeVisible();
  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  await expect(cards(page)).toHaveCount(total);
  await expect(page).toHaveURL(/\/mentions$/);
});

test('/mentions: « Mieux notées », rated first, without reviews last; other sorts in one grid', async ({
  page,
}) => {
  await page.goto('/mentions?tri=note');
  await waitForHydration(page);
  await expect(page.locator('main section[aria-label^="Lettre "]')).toHaveCount(0);
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
  if (firstNone >= 0) await expect(cards(page).nth(firstNone)).toContainText('Pas encore d’avis');
  await page.getByRole('combobox', { name: 'Trier par' }).selectOption('parcours');
  await expect(page).toHaveURL(/tri=parcours/);
  const counts = await cards(page).evaluateAll((els) =>
    els.map((e) => Number(e.querySelector('strong')!.textContent!.replace(/\D/g, ''))),
  );
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
});

test('city picker: keyboard, search without accents, Escape, outside click, no city without mention', async ({
  page,
}) => {
  const zones = await openZones();
  expect(zones.length < 1, 'fixtures: no open city').toBe(false);
  // an open city with nothing published in it: never offered
  await sql(
    `INSERT INTO "LaunchZone" (id, slug, name, "epciCode", "epciName", "communeCodes", open, "updatedAt")
     VALUES ('zz-test-zone', 'zz-vide', 'Zzville', 'zz-test', 'Zz', '{}', true, now())
     ON CONFLICT (slug) DO UPDATE SET open = true`,
  );
  await expireZonesCache(page);
  try {
    await page.goto('/mentions');
    await waitForHydration(page);
    const trigger = page.getByRole('button', { name: /^Ville/ });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Choisir une ville' });
    const field = dialog.getByRole('combobox', { name: 'Chercher une ville' });
    await expect(field).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const options = dialog.getByRole('option');
    // « Toutes les villes », then the open cities in alphabetical order, with their counts
    await expect(options).toHaveCount(zones.length + 1);
    await expect(options.first()).toHaveText(/^Toutes les villes/);
    const names = (await options.allTextContents())
      .slice(1)
      .map((t) => t.replace(/\d.*$/, '').trim());
    expect(names).toEqual(zones.map((z) => z.name).sort((a, b) => a.localeCompare(b, 'fr')));
    await expect(options.nth(1)).toHaveText(/\d+ mentions?/);
    await expect(dialog).not.toContainText('Zzville');
    await expect(dialog).toContainText(
      `${zones.length} ville${zones.length > 1 ? 's ouvertes' : ' ouverte'} · on ouvre les suivantes petit à petit`,
    );
    // search: upper case and an accent added, still found
    const city = zones[0]!;
    const typed = city.name.toUpperCase().replace(/E/, 'É').replace(/A/, 'À');
    await field.fill(typed);
    await expect(options).toHaveCount(2);
    await page.keyboard.press('ArrowDown');
    await expect(field).toHaveAttribute('aria-activedescendant', /o1$/);
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`ville=${city.slug}`));
    await expect(trigger).toContainText(city.name);
    // reopen: the chosen city is ticked; Escape closes and gives the focus back
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('option', { selected: true })).toHaveText(new RegExp(city.name));
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // a city not open yet
    await trigger.click();
    await field.fill('Lyonnzz');
    await expect(dialog).toContainText(
      'Pas encore de masters à « Lyonnzz ». On ouvre les villes petit à petit.',
    );
    // a click outside closes
    await page.getByRole('heading', { level: 1 }).click();
    await expect(dialog).toHaveCount(0);
    // the small cross removes the filter
    await page.getByRole('button', { name: 'Retirer le filtre de ville' }).click();
    await expect(trigger).toContainText('Toutes');
    await expect(page).not.toHaveURL(/ville=/);
  } finally {
    await sql(`DELETE FROM "LaunchZone" WHERE slug = 'zz-vide'`);
    await expireZonesCache(page);
  }
});

test('⌘K puts the cursor in the filter field of /mentions', async ({ page }) => {
  await page.goto('/mentions');
  await waitForHydration(page);
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('searchbox', { name: 'Filtrer les mentions' })).toBeFocused();
});

test('no serious axe violation on /mentions, with the city picker open', async ({ page }) => {
  await page.goto('/mentions');
  await waitForHydration(page);
  await page.getByRole('button', { name: /^Ville/ }).click();
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
