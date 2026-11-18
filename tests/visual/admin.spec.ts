import { test, type Page } from '@playwright/test';
import { expireTags, loginAdmin, waitForHydration } from '../e2e/helpers';
import { createDemoConflicts, dropDemoConflicts } from './fixtures';

/**
 * Screenshots of the redesigned admin at 1440 px, kept in tests/visual/screens (one per screen
 * and state). Only with VISUAL=1: `playwright test --project=visual`.
 */
test.skip(!process.env.VISUAL, 'screenshots only on demand (VISUAL=1)');
test.describe.configure({ mode: 'serial' });

const shot = (page: Page, name: string, fullPage = true) =>
  page.screenshot({ path: `tests/visual/screens/${name}.png`, fullPage });

test.beforeEach(async ({ page }) => {
  await loginAdmin(page);
  await expireTags(page, ['admin-counts']);
});

test('0 · barre latérale', async ({ page }) => {
  await page.goto('/admin/equipe');
  await waitForHydration(page);
  await shot(page, '0-sidebar-equipe', false);
});

test('1 · vue d’ensemble', async ({ page }) => {
  await page.goto('/admin');
  await waitForHydration(page);
  await shot(page, '1-vue-ensemble');
});

test('2 · fiches « À traiter », tiroir ouvert puis 3 fiches cochées', async ({ page }) => {
  await page.goto('/admin/fiches');
  await waitForHydration(page);
  const table = page.getByRole('table');
  await table.getByRole('button').first().click();
  await page.getByRole('dialog').getByRole('heading', { level: 2 }).waitFor();
  await page.waitForTimeout(400);
  await shot(page, '2-fiches-tiroir', false);
  await page.keyboard.press('Escape');
  const boxes = table.getByRole('checkbox', { name: /^Sélectionner / });
  for (const i of [0, 1, 2]) await boxes.nth(i).check();
  await page.getByRole('region', { name: 'Actions groupées' }).waitFor();
  await page.waitForTimeout(400);
  await shot(page, '2-fiches-selection', false);
});

test('3 · modifier une fiche, avec le conflit', async ({ page }) => {
  const id = await createDemoConflicts();
  try {
    // The save bar is fixed: a tall window (as the mockup) rather than a full-page capture.
    await page.setViewportSize({ width: 1440, height: 1900 });
    await page.goto(`/admin/fiches/${id}`);
    await waitForHydration(page);
    await page.getByRole('radio', { name: /UFR Histoire/ }).click();
    await page
      .getByRole('radiogroup', { name: 'Publication' })
      .getByRole('radio', { name: 'Brouillon' })
      .click();
    await shot(page, '3-modifier-fiche-conflit', false);
  } finally {
    await dropDemoConflicts();
  }
});

test('4 · récupération, les 4 onglets', async ({ page }) => {
  await createDemoConflicts();
  try {
    await page.goto('/admin/recuperation');
    await waitForHydration(page);
    await page.getByRole('button', { name: /Voir les 7 fiches/ }).click();
    await page
      .getByRole('link', { name: /Valorisation des nouveaux patrimoines/ })
      .first()
      .waitFor();
    await shot(page, '4-recuperation-a-traiter');
  } finally {
    await dropDemoConflicts();
  }
  await page.getByRole('tab', { name: 'Sources' }).click();
  await page.getByRole('table').waitFor();
  await shot(page, '4-recuperation-sources');
  await page.getByRole('tab', { name: 'Établissements' }).click();
  await page.getByRole('switch', { name: 'Villes ouvertes seulement' }).waitFor();
  await shot(page, '4-recuperation-etablissements');
  await page.getByRole('tab', { name: 'Journal' }).click();
  await page.getByRole('combobox', { name: 'Période' }).selectOption('tout');
  await page.getByRole('tabpanel').getByRole('button', { expanded: false }).first().click();
  await page
    .getByLabel(/^Journal du passage/)
    .locator('span.font-mono')
    .first()
    .waitFor();
  await shot(page, '4-recuperation-journal');
});

test('5 · journal d’audit, un détail déplié', async ({ page }) => {
  await page.goto('/admin/audit');
  await waitForHydration(page);
  const button = page
    .locator('div.border-b')
    .filter({ hasText: /a modifié|a arbitré/ })
    .getByRole('button', { name: 'Détail' })
    .first();
  const id = await button.getAttribute('aria-controls');
  await button.click();
  await page.locator(`#${id}`).getByRole('table', { name: 'Avant et après' }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await shot(page, '5-journal-audit-detail', false);
});
