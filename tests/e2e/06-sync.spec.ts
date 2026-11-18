import { expect, test } from '@playwright/test';
import { loginAdmin, sql, waitForHydration } from './helpers';

test('admin: « Lancer » queues a pass of the source, shown first in its journal', async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto('/admin/recuperation?onglet=sources');
  await waitForHydration(page);
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: /InserSup · insertion pro/ }) });
  await expect(row.getByRole('button', { name: 'Simuler' })).toBeVisible();
  const since = new Date();
  await row.getByRole('button', { name: 'Lancer' }).click();
  await expect(row.getByRole('status')).toHaveText('En file');

  // The worker takes it; the journal of the source shows it first, with its log lines.
  await expect
    .poll(
      async () =>
        (
          await sql<{ status: string }>(
            `SELECT r.status FROM "SyncRun" r JOIN "DataSource" s ON s.id = r."sourceId"
              WHERE s.key = 'insersup' AND r."queuedAt" >= $1 ORDER BY r."queuedAt" DESC LIMIT 1`,
            [since],
          )
        )[0]?.status,
      { timeout: 60_000 },
    )
    .toMatch(/SUCCEEDED|SKIPPED|FAILED|AWAITING_VALIDATION/);
  await page.goto('/admin/recuperation?onglet=journal&source=insersup');
  await waitForHydration(page);
  const pass = page
    .getByRole('tabpanel')
    .getByRole('button', { name: /InserSup · insertion pro/ })
    .first();
  await expect(pass).toContainText('aujourd’hui');
  await pass.click();
  await expect(page.getByLabel(/^Journal du passage/).first()).toContainText('lancement manuel');
});
