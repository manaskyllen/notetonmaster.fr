import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { E2E_CURSUS as C } from './fixtures/names';
import { FX } from '../integration/fixtures/ids';
import { ADMIN, loginAdmin, sql, waitForHydration } from './helpers';
import { horizontalOverflow, WIDTHS } from './responsive';
import { databaseUrl } from './stack';

/**
 * Cursus of one parcours (issue #21), on the fixtures of ./fixtures/cursus.ts: one card per
 * parcours, the chip of the hero, « Choisis ton cursus » / « Choisis ton rythme » / « N fiches Mon
 * Master », the 301 of the former URLs, the search by any number, the admin corrections that
 * survive the next grouping. Serial: the admin tests change the data of this server.
 */
test.describe.configure({ mode: 'serial' });

const STRASBOURG_TITLE = 'Projets de coopération et intelligence collective';
const cards = (page: Page, title: string | RegExp) =>
  page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: title, exact: typeof title === 'string' }) });

/** The grouping step that ends every Mon Master sync (lib/catalog/cursus.ts applyCursusGrouping). */
function regroup() {
  execFileSync('node_modules/.bin/tsx', ['scripts/cursus-migrate.ts'], {
    env: { ...process.env, DATABASE_URL: databaseUrl(), CURSUS_DATABASE_URL: databaseUrl() },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

test('Strasbourg: one card, « 3 cursus » and the three chips', async ({ page }) => {
  await page.goto('/explorer?q=projets+cooperation+intelligence+collective');
  await waitForHydration(page);
  const card = cards(page, STRASBOURG_TITLE);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('3 cursus');
  for (const n of ['Strasbourg', 'Kehl', 'Passau'])
    await expect(card.getByText(n, { exact: true })).toBeVisible();
});

test('Strasbourg fiche: short title, subtitle, the chip opens Admission on the cursus', async ({
  page,
}) => {
  await page.goto(`/parcours/${C.strasbourg.parcours}`);
  await waitForHydration(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(STRASBOURG_TITLE);
  await expect(page.getByText(/^Tronc commun menant vers les M2/)).toBeVisible();
  await page.getByRole('link', { name: /3 cursus : Strasbourg, Kehl, Passau/ }).click();
  await expect(page.getByRole('tab', { name: 'Admission' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const section = page.locator('#cursus');
  await expect(section.getByRole('heading', { name: 'Choisis ton cursus' })).toBeInViewport();
  // the site's figures: places, applications, offers / applications
  const rows = section.getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Strasbourg');
  await expect(rows.nth(0)).toContainText('30places338candidatures17 %');
  await expect(rows.nth(1)).toContainText('Kehl');
  await expect(rows.nth(1)).toContainText('10places53candidatures49 %');
  await expect(rows.nth(2)).toContainText('Passau');
  await expect(rows.nth(2)).toContainText('2places42candidatures5 %');
  await expect(section).toContainText('42places au total');
  await expect(section).toContainText('5 à 49 %');
  await expect(section).toContainText('Les avis portent sur le parcours, tous cursus confondus.');
  await expect(page.getByRole('heading', { name: 'Commun à tous les cursus' })).toBeVisible();
});

test('the three former URLs answer 301 straight to the parcours', async ({ request }) => {
  for (const old of C.strasbourg.olds) {
    const res = await request.get(`/parcours/${old}`, { maxRedirects: 0 });
    expect(res.status(), old).toBe(301);
    expect(new URL(res.headers().location!, 'http://x').pathname).toBe(
      `/parcours/${C.strasbourg.parcours}`,
    );
  }
  expect(
    (await request.get(`/parcours/${C.strasbourg.parcours}`, { maxRedirects: 0 })).status(),
  ).toBe(200);
});

test('a number of any cursus finds the parcours, once', async ({ page, request }) => {
  const json = (await (await request.get('/api/search?q=2400012PISGY')).json()) as {
    results: { href: string }[];
  };
  expect(json.results.map((r) => r.href)).toEqual([`/parcours/${C.strasbourg.parcours}`]);
  await page.goto('/explorer?q=2400012PISGY');
  await expect(cards(page, STRASBOURG_TITLE)).toHaveCount(1);
});

test('the review form opened with the former slug of a cursus is set on the parcours', async ({
  page,
}) => {
  await page.goto(`/avis/nouveau?parcours=${C.strasbourg.olds[1]}`);
  await waitForHydration(page);
  await expect(page.getByText(STRASBOURG_TITLE, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Kehl|Passau|cursus/)).toHaveCount(0);
});

test('a short link printed for a cursus leads to the parcours and counts the scan', async ({
  page,
}) => {
  const count = async () =>
    (
      await sql<{ n: number }>(
        `SELECT COALESCE(sum(s.count), 0)::int AS n FROM qr_scans_daily s JOIN qr_links l ON l.id = s.link_id
          WHERE l.slug = 'e2e-cursus-passau'`,
      )
    )[0]!.n;
  const before = await count();
  await page.goto('/q/e2e-cursus-passau');
  await expect(page).toHaveURL((u) => u.pathname === `/parcours/${C.strasbourg.parcours}`);
  await expect.poll(count).toBe(before + 1);
});

test('an initial / work-study pair: « Initiale ou alternance », « Aussi en alternance », « Choisis ton rythme »', async ({
  page,
}) => {
  await page.goto('/explorer?q=management+de+projets+fixtures+cursus&modalite=alternance');
  await waitForHydration(page);
  const card = cards(page, 'Management de projets (fixtures cursus)');
  await expect(card).toHaveCount(1);
  await expect(card.getByText('Initiale ou alternance', { exact: true })).toBeVisible();
  await expect(card).not.toContainText('2 cursus');
  await page.goto(`/parcours/${C.pair.parcours}`);
  await waitForHydration(page);
  await page.getByRole('link', { name: /Aussi en alternance/ }).click();
  const section = page.locator('#cursus');
  await expect(section.getByRole('heading', { name: 'Choisis ton rythme' })).toBeInViewport();
  await expect(section.getByRole('listitem').nth(0)).toContainText('Formation initiale');
  await expect(section.getByRole('listitem').nth(1)).toContainText('En alternance');
});

test('numbers that nothing tells apart: one card, « 25 fiches Mon Master », « Voir les 25 fiches »', async ({
  page,
}) => {
  await page.goto('/explorer?q=enseignement+second+degre+fixtures');
  await waitForHydration(page);
  const card = cards(page, 'Enseignement du second degré (fixtures)');
  await expect(card).toHaveCount(1);
  await expect(card).not.toContainText('cursus');
  await page.goto(`/parcours/${C.icp.parcours}?onglet=admission`);
  await waitForHydration(page);
  await expect(page.getByRole('link', { name: /cursus/ })).toHaveCount(0);
  const section = page.locator('#cursus');
  await expect(
    section.getByRole('heading', { name: '25 fiches Mon Master pour ce parcours' }),
  ).toBeVisible();
  await expect(section.getByRole('row')).toHaveCount(7); // header + 6
  await section.getByRole('button', { name: 'Voir les 25 fiches' }).click();
  await expect(section.getByRole('row')).toHaveCount(26);
});

test('26 cursus named by their city: a compact table and « Voir les 26 cursus »', async ({
  page,
}) => {
  await page.goto(`/parcours/${C.cnam.parcours}`);
  await waitForHydration(page);
  await page.getByRole('link', { name: /26 cursus/ }).click();
  const section = page.locator('#cursus');
  await expect(section.getByRole('heading', { name: 'Choisis ton cursus' })).toBeVisible();
  await expect(section.getByRole('row')).toHaveCount(7);
  await section.getByRole('button', { name: 'Voir les 26 cursus' }).click();
  await expect(section.getByRole('row')).toHaveCount(27);
  for (const city of ['Dijon', 'Evry', 'Cholet', 'Saint-Etienne', 'La Roche-sur-Yon'])
    await expect(section.getByRole('rowheader', { name: city, exact: true })).toBeVisible();
});

test('a parcours with one cursus does not change: same URL, no chip, no section', async ({
  page,
  request,
}) => {
  expect(
    (await request.get(`/parcours/${FX.programs.illkirch}`, { maxRedirects: 0 })).status(),
  ).toBe(200);
  await page.goto(`/parcours/${FX.programs.illkirch}?onglet=admission`);
  await waitForHydration(page);
  await expect(page.locator('#cursus')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /cursus|Aussi en alternance/ })).toHaveCount(0);
  await expect(page.getByText(/Le M2 dépend/)).toHaveCount(0);
});

test('no horizontal scroll at 320 px on the fiches with cursus', async ({ page }) => {
  await page.setViewportSize({ width: WIDTHS.small, height: 800 });
  for (const slug of [C.strasbourg.parcours, C.cnam.parcours, C.icp.parcours, C.pair.parcours]) {
    await page.goto(`/parcours/${slug}?onglet=admission`);
    await waitForHydration(page);
    const { over, culprits } = await horizontalOverflow(page);
    expect(over, `${slug}: ${culprits.join(', ')}`).toBeLessThanOrEqual(0);
  }
});

test('admin: a label typed by hand and a split cursus survive the next grouping', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const [p] = await sql<{ id: string }>(`SELECT id FROM "Program" WHERE slug = $1`, [
    C.strasbourg.parcours,
  ]);
  await loginAdmin(page, ADMIN);
  await page.goto(`/admin/fiches/${p!.id}`);
  await waitForHydration(page);
  const panel = page.getByRole('region', { name: /^Cursus/ });
  await expect(panel.getByRole('heading', { name: 'Cursus (3)' })).toBeVisible();
  page.on('dialog', (d) => void d.accept());

  // Passau gets a label of its own
  const passau = panel.getByRole('form', { name: 'Cursus 2400012PISGY' });
  await passau.getByLabel('Libellé').fill('Franco-allemand');
  await passau.getByRole('button', { name: 'Enregistrer le libellé' }).click();
  await expect(panel.getByRole('status')).toContainText('Libellé enregistré');

  // Kehl goes back to its own fiche
  await panel
    .getByRole('form', { name: 'Cursus 2400012PGW1S' })
    .getByRole('button', { name: 'Séparer' })
    .click();
  await expect(panel.getByRole('status')).toContainText('Cursus séparé');

  regroup();

  const [kehl] = await sql<{ status: string }>(
    `SELECT status::text FROM "Program" WHERE slug = 'e2e-pcic-kehl'`,
  );
  expect(kehl!.status).toBe('ACTIVE');
  const [label] = await sql<{ l: string }>(
    `SELECT "cursusLabel" AS l FROM "MonMasterEntry" WHERE code = '2400012PISGY'`,
  );
  expect(label!.l).toBe('Franco-allemand');
  const res = await page.request.get('/parcours/e2e-pcic-kehl', { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  await page.goto(`/parcours/${C.strasbourg.parcours}`);
  await expect(
    page.getByRole('link', { name: /2 cursus : Strasbourg, Franco-allemand/ }),
  ).toBeVisible();
});
