import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createDemoConflicts, dropDemoConflicts } from '../visual/fixtures';
import { animationsDone, loginAdmin, waitForHydration } from './helpers';

/** axe on the five redesigned admin screens (and their open states): no serious violation. */
async function check(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('nextjs-portal')
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  for (const v of serious)
    console.log(
      `[${label}] ${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join('\n  ')}`,
    );
  expect(serious, `${label}: serious/critical axe violations`).toEqual([]);
}

test('axe: vue d’ensemble, fiches (tiroir, sélection), modifier, récupération (4 onglets), audit', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAdmin(page);
  await check(page, 'vue d’ensemble');

  await page.goto('/admin/fiches');
  await waitForHydration(page);
  await check(page, 'fiches');
  await page
    .getByRole('table')
    .getByRole('checkbox', { name: /^Sélectionner / })
    .first()
    .check();
  await page.getByRole('region', { name: 'Actions groupées' }).waitFor();
  await check(page, 'fiches · sélection');
  await page.getByRole('table').getByRole('button').first().click();
  await page.getByRole('dialog').getByRole('heading', { level: 2 }).waitFor();
  await animationsDone(page);
  await check(page, 'fiches · tiroir');

  const id = await createDemoConflicts();
  try {
    await page.goto(`/admin/fiches/${id}`);
    await waitForHydration(page);
    await check(page, 'modifier une fiche');
    await page.goto('/admin/recuperation');
    await waitForHydration(page);
    await check(page, 'récupération · à traiter');
  } finally {
    await dropDemoConflicts();
  }
  for (const tab of ['sources', 'etablissements', 'journal']) {
    await page.goto(`/admin/recuperation?onglet=${tab}`);
    await waitForHydration(page);
    await check(page, `récupération · ${tab}`);
  }
  const pass = page.getByRole('tabpanel').getByRole('button', { expanded: false }).first();
  await pass.click();
  await expect(page.getByRole('tabpanel').getByRole('button', { expanded: true })).toHaveCount(1);
  await animationsDone(page);
  await check(page, 'récupération · passage déplié');

  await page.goto('/admin/audit');
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Détail' }).first().click();
  await check(page, 'journal d’audit');
});
