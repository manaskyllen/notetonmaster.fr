import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginAdmin, loginStudent, waitForHydration } from './helpers';

async function audit(page: Page, label: string) {
  await waitForHydration(page);
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

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test('home', async ({ page }) => {
      await page.goto('/');
      await audit(page, `home ${scheme}`);
    });
    test('program page', async ({ page }) => {
      await page.goto('/parcours/valorisation-des-nouveaux-patrimoines');
      await audit(page, `parcours ${scheme}`);
    });
    test('Explorer', async ({ page }) => {
      await page.goto('/explorer');
      await audit(page, `explorer ${scheme}`);
    });
    test('mention page', async ({ page }) => {
      await page.goto('/mentions/droit');
      await audit(page, `mention ${scheme}`);
    });
    test('« Pas encore sur notetonmaster »', async ({ page }) => {
      await page.goto('/parcours/evenementiel-mediation-des-arts-et-des-sciences');
      await audit(page, `pas encore ${scheme}`);
    });
    test('review form', async ({ page }) => {
      await page.goto('/avis/nouveau');
      await audit(page, `avis ${scheme}`);
    });
    test('student space', async ({ page }) => {
      await loginStudent(page, 'alexis.demo@demo.notetonmaster.local');
      await audit(page, `espace ${scheme}`);
      await page.goto('/espace/verification');
      await audit(page, `espace verification ${scheme}`);
    });

    test('⌘K palette open on a fiche', async ({ page }) => {
      await page.goto('/parcours/valorisation-des-nouveaux-patrimoines');
      await waitForHydration(page);
      const palette = page.getByRole('dialog', { name: 'Recherche et navigation' });
      await expect(async () => {
        if (!(await palette.isVisible())) await page.keyboard.press('Control+k');
        await expect(palette).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 20_000 });
      await palette.getByRole('combobox').fill('rncp 42684');
      await expect(palette.getByRole('option').first()).toBeVisible();
      await audit(page, `palette ${scheme}`);
    });

    test('admin overview', async ({ page }) => {
      await loginAdmin(page);
      await audit(page, `admin ${scheme}`);
    });
  });
}
