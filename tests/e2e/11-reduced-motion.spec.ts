import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './helpers';

/**
 * Brief, section 4: with « prefers-reduced-motion: reduce », everything is switched off or
 * reduced to a plain fade. After triggering the animations of each page, no running
 * animation or transition may move, scale or rotate anything.
 */
test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function movingAnimations(page: Page) {
  // Two frames: what the last action triggered has started.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .filter((a) => {
        const frames = (a.effect as KeyframeEffect | null)?.getKeyframes?.() ?? [];
        const moves = frames.some((k) =>
          ['transform', 'translate', 'scale', 'rotate'].some((p) => p in k && k[p] !== 'none'),
        );
        const prop = (a as unknown as { transitionProperty?: string }).transitionProperty ?? '';
        return moves || /transform|translate|scale|rotate/.test(prop);
      })
      .map(
        (a) =>
          (a as unknown as { animationName?: string }).animationName ??
          (a as unknown as { transitionProperty?: string }).transitionProperty ??
          'animation',
      ),
  );
}

test('reduced motion: no transform is animated in the design system', async ({ page }) => {
  // The design system page: development and local production builds (never a real deployment).
  // Every component animation, triggered by hand.
  await page.goto('/design-system');
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Continuer' }).first().click();
  await page
    .getByRole('button', { name: /^Utile/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Suivre ce master' }).first().click();
  await page.getByRole('button', { name: /Compteur qui change/ }).click();
  await page
    .getByRole('radio', { name: /4 sur 5/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Section repliable' }).click();
  await page.getByRole('button', { name: /Afficher un toast/ }).click();
  expect(await movingAnimations(page)).toEqual([]);
});

test('reduced motion: no transform is animated on the public pages', async ({ page }) => {
  // Home page: the suggestions of the guided search, then the city picker.
  await page.goto('/');
  await waitForHydration(page);
  await page.getByRole('combobox', { name: 'Quoi ?' }).fill('patrimoine');
  await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible();
  expect(await movingAnimations(page)).toEqual([]);
  await page.getByRole('button', { name: /^Où \?/ }).click();
  await expect(page.getByRole('dialog', { name: 'Choisir une ville' })).toBeVisible();
  expect(await movingAnimations(page)).toEqual([]);

  // A fiche: ⌘K palette and « Utile ».
  await page.goto('/parcours/valorisation-des-nouveaux-patrimoines');
  await waitForHydration(page);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Recherche et navigation' })).toBeVisible();
  await page.getByRole('combobox').fill('nantes');
  expect(await movingAnimations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: /^Utile/ })
    .first()
    .click();
  expect(await movingAnimations(page)).toEqual([]);

  // Review form: steps, autocomplete.
  await page.goto('/avis/nouveau');
  await waitForHydration(page);
  await page.getByRole('combobox', { name: 'Quel master as-tu suivi ?' }).fill('nantes');
  expect(await movingAnimations(page)).toEqual([]);
});
