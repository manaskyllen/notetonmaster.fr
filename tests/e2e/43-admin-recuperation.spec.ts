import { expect, test } from '@playwright/test';
import { expireTags, loginAdmin, sql, waitForHydration } from './helpers';

/**
 * Récupération: Relancer and Pause 7 jours on a collect error (a fictitious establishment on a
 * `.invalid` host: nothing is fetched), the « Villes ouvertes seulement » switch, a pass unfolded.
 */
const UNI = 'e2e-recup-uni';
const HOST = 'e2e-recuperation.invalid';

async function fixture() {
  await cleanup();
  // « Relancer » joins a pass of the source already queued or running (lib/connectors/runner.ts),
  // and the demo seed has one « en cours »: set aside for the test, put back by cleanup().
  parked = await sql<{ id: string; status: string }>(
    `SELECT r.id, r.status FROM "SyncRun" r JOIN "DataSource" s ON s.id = r."sourceId"
      WHERE s.key = 'univ-sites' AND r.status IN ('QUEUED', 'RUNNING')`,
  );
  for (const r of parked)
    await sql(`UPDATE "SyncRun" SET status = 'SKIPPED' WHERE id = $1`, [r.id]);
  await sql(
    `INSERT INTO "University" (id, name, slug, city, region, "siteDomains", "updatedAt")
     VALUES ($1, 'Université E2E de la collecte', 'e2e-recup', 'Testville', 'Test', ARRAY[$2], now())`,
    [UNI, HOST],
  );
  await sql(
    `INSERT INTO "CrawlHost" (host, failures, "pausedUntil", "pausedReason", "updatedAt")
     VALUES ($1, 3, now() + interval '1 day', '3 échecs de suite (HTTP 503)', now())`,
    [HOST],
  );
  await sql(
    `INSERT INTO "DataIssue" (id, kind, "targetType", "targetId", field, severity, detail, "universityId")
     VALUES ('e2e-recup-issue', 'COLLECT_ERROR', 'UNIVERSITY', $1, '', 'BLOCK', 'HTTP 503 Service Unavailable · ${HOST}', $1)`,
    [UNI],
  );
}

let parked: { id: string; status: string }[] = [];

async function cleanup() {
  for (const r of parked)
    await sql(`UPDATE "SyncRun" SET status = $1::"SyncStatus" WHERE id = $2`, [r.status, r.id]);
  parked = [];
  await sql(
    `DELETE FROM "SyncRun" WHERE stats->'options'->'universityIds' ? $1 AND status IN ('QUEUED', 'SKIPPED', 'SUCCEEDED', 'FAILED')`,
    [UNI],
  );
  await sql(`DELETE FROM "DataIssue" WHERE "targetId" = $1 OR id = 'e2e-recup-issue'`, [UNI]);
  await sql(`DELETE FROM "CrawlHost" WHERE host = $1`, [HOST]);
  await sql(`DELETE FROM "University" WHERE id = $1`, [UNI]);
}

test.afterAll(cleanup);

test('Récupération: Relancer, Pause 7 jours, villes ouvertes seulement, un passage déplié', async ({
  page,
}) => {
  await fixture();
  await loginAdmin(page);
  await expireTags(page, ['admin-counts']);
  await page.goto('/admin/recuperation');
  await waitForHydration(page);
  await expect(page.getByRole('tab', { name: /À traiter/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const card = page
    .locator('div')
    .filter({ hasText: /^Sites des universités · Université E2E de la collecte/ })
    .first();
  await expect(card).toContainText('HTTP 503 Service Unavailable');

  // Relancer: the pause of the host is lifted and a pass limited to this establishment is queued.
  await card.getByRole('button', { name: 'Relancer' }).click();
  await expect(card.getByRole('button', { name: 'Relancée' })).toBeDisabled();
  const [host] = await sql<{ pausedUntil: Date | null }>(
    `SELECT "pausedUntil" FROM "CrawlHost" WHERE host = $1`,
    [HOST],
  );
  expect(host!.pausedUntil).toBeNull();
  await expect
    .poll(
      async () =>
        (await sql(`SELECT id FROM "SyncRun" WHERE stats->'options'->'universityIds' ? $1`, [UNI]))
          .length,
    )
    .toBeGreaterThan(0);

  // Pause 7 jours: the error leaves « À traiter » and the host is paused a week.
  await page.reload();
  await waitForHydration(page);
  const again = page
    .locator('div')
    .filter({ hasText: /^Sites des universités · Université E2E de la collecte/ })
    .first();
  await again.getByRole('button', { name: 'Pause 7 jours' }).click();
  await expect(page.getByText('Université E2E de la collecte')).toHaveCount(0);
  const [issue] = await sql<{ ignoredUntil: Date }>(
    `SELECT "ignoredUntil" FROM "DataIssue" WHERE id = 'e2e-recup-issue'`,
  );
  expect(new Date(issue!.ignoredUntil).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
  const [paused] = await sql<{ pausedUntil: Date }>(
    `SELECT "pausedUntil" FROM "CrawlHost" WHERE host = $1`,
    [HOST],
  );
  expect(new Date(paused!.pausedUntil).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);

  // Établissements: open cities only by default; the switch shows them all (in the URL).
  await page.getByRole('tab', { name: 'Établissements' }).click();
  const sw = page.getByRole('switch', { name: 'Villes ouvertes seulement' });
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Université E2E de la collecte')).toHaveCount(0);
  await sw.click();
  await expect(page).toHaveURL(/toutes=1/);
  await page.getByLabel('Chercher un établissement').fill('E2E de la collecte');
  // The search reaches the address after its debounce: the next step starts from there.
  await expect(page).toHaveURL(/q=E2E\+de\+la\+collecte/);
  await expect(page.getByRole('row', { name: /Université E2E de la collecte/ })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: /dans les villes ouvertes · .* au total/ }),
  ).toBeVisible();

  // Journal: one line per pass; a click unfolds its log lines.
  await page.getByRole('tab', { name: 'Journal' }).click();
  await expect(page).toHaveURL(/onglet=journal/);
  await page.getByLabel('Période').selectOption('tout');
  // The new list arrives with the address: a pass opened before would be reset by it.
  await expect(page).toHaveURL(/periode=tout/);
  await expect(page.getByLabel('Période')).toHaveValue('tout');
  const panelId = await page
    .getByRole('tabpanel')
    .getByRole('button', { expanded: false })
    .first()
    .getAttribute('aria-controls');
  const pass = page.locator(`button[aria-controls="${panelId}"]`);
  await pass.click();
  await expect(pass).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel(/^Journal du passage/).first()).toBeVisible();
});

test('a tab chosen right after typing a search is not undone by the search', async ({ page }) => {
  await loginAdmin(page);
  await page.goto('/admin/recuperation?onglet=etablissements');
  await waitForHydration(page);
  // A slow server for the journal (as on a busy CI machine): the tab navigation is still in
  // flight when the debounce of the search ends, which is when the old code overwrote it.
  await page.route(/onglet=journal/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  // No wait between the keystrokes and the click: the search is still in its debounce.
  await page.getByLabel('Chercher un établissement').pressSequentially('nantes');
  await page.getByRole('tab', { name: 'Journal' }).click();
  await expect(page).toHaveURL(/onglet=journal/);
  await expect(page.getByRole('tab', { name: 'Journal' })).toHaveAttribute('aria-selected', 'true');
  // Longer than the debounce (200 ms) and a round trip: the address stays on the journal.
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/onglet=journal/);
  expect(page.url()).not.toContain('q=');
});
