import { expect, test } from '@playwright/test';
import { waitForHydration } from './helpers';
import { horizontalOverflow, publicPages, VNP, WIDTHS } from './responsive';

/**
 * Responsive (issue #14): no public page scrolls sideways, from the small phone (320 px, or
 * 640 px at 200 % zoom) to the small laptop. A table or a row of chips may scroll inside its own
 * box, never the page.
 */
for (const width of [WIDTHS.small, WIDTHS.phone, WIDTHS.tablet]) {
  test(`no horizontal scroll at ${width} px, on every public page`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
    const failures: string[] = [];
    for (const p of await publicPages()) {
      await page.goto(p.path);
      await waitForHydration(page);
      const { over, culprits } = await horizontalOverflow(page);
      if (over > 0) failures.push(`${p.name} (${p.path}) : +${over}px · ${culprits.join(', ')}`);
    }
    expect(failures).toEqual([]);
  });
}

test('the review form, step by step, at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: WIDTHS.small, height: 800 });
  await page.goto(`/avis/nouveau?parcours=${VNP}`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await waitForHydration(page);
  const check = async (step: string) => {
    const { over, culprits } = await horizontalOverflow(page);
    expect(over, `${step}: ${culprits.join(', ')}`).toBeLessThanOrEqual(0);
  };
  await page.getByRole('radio', { name: 'J’ai arrêté en cours' }).click();
  await page.getByLabel('Entré·e en').selectOption(String(new Date().getFullYear() - 1));
  await check('étape 1');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page
    .getByRole('radiogroup', { name: 'Note globale' })
    .getByRole('radio', { name: '3 sur 5' })
    .click();
  await page.getByRole('button', { name: '+ Ajouter des notes détaillées (facultatif)' }).click();
  await check('étape 2');
  await page.getByLabel('Ce que tu as aimé').fill('Des cours solides et une équipe disponible.');
  await page.getByLabel('Ce que tu n’as pas aimé').fill('Peu de numérique malgré la brochure.');
  await page.getByLabel('Ton master en une phrase').fill('Solide, mais pas pour moi');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await check('étape 3');
});

test('form fields are 16 px at least on a phone (no zoom of iOS)', async ({ page }) => {
  await page.setViewportSize({ width: WIDTHS.phone, height: 844 });
  for (const path of [`/avis/nouveau?parcours=${VNP}`, '/connexion', '/signaler', '/explorer']) {
    await page.goto(path);
    await waitForHydration(page);
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          'input:not([type=hidden], [type=checkbox], [type=radio]), select, textarea',
        ),
      ]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => `${el.tagName.toLowerCase()}#${el.id} ${getComputedStyle(el).fontSize}`),
    );
    expect(small, path).toEqual([]);
  }
});
