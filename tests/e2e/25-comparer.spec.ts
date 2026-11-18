import { expect, test, type Locator, type Page } from '@playwright/test';
import { animationsDone, waitForHydration } from './helpers';

/**
 * « Comparer » → « ✓ Ajouté » and the rules of the comparison.
 * A query that returns many cards: « culture » on Explorer.
 */
const LIST = '/explorer?q=culture';

async function open(page: Page, url = LIST) {
  await page.goto(url);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(url);
  await waitForHydration(page);
}
const buttons = (page: Page) => page.getByRole('button', { name: /^Comparer : / });
const cards = (page: Page) =>
  page.getByRole('list', { name: 'Parcours de la page' }).getByRole('listitem');
/** Centred, so the sticky compare bar never covers it. */
async function press(l: Locator, force = false) {
  await l.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  // aria-disabled counts as disabled for Playwright; a person can still press it.
  await l.click({ force });
}
const bar = (page: Page) => page.locator('.nm-compare-bar');

/** Position in the page (not the viewport: the click may scroll). */
async function box(l: Locator) {
  return l.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return {
      x: Math.round(b.x + window.scrollX),
      y: Math.round(b.y + window.scrollY),
      w: Math.round(b.width),
      h: Math.round(b.height),
    };
  });
}

test('the button keeps its 132px width; the card around it does not move', async ({ page }) => {
  await open(page);
  const card = cards(page).nth(0);
  const next = cards(page).nth(1);
  const button = card.getByRole('button', { name: /^Comparer : / });
  // measured once the cascade of the cards is over
  for (const c of [card, next])
    await c.evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished)));
  const before = { button: await box(button), card: await box(card), next: await box(next) };
  expect(before.button.w).toBe(132);
  await card.screenshot({ path: test.info().outputPath('avant.png'), animations: 'disabled' });

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toContainText('Ajouté');
  // Let the pop and the tick end before measuring; the pointer away (the card lifts on hover).
  await page.mouse.move(0, 0);
  await animationsDone(page);
  const after = { button: await box(button), card: await box(card), next: await box(next) };
  expect(after).toEqual(before);
  await card.screenshot({ path: test.info().outputPath('apres.png'), animations: 'disabled' });

  // Back the same way
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.move(0, 0);
  await animationsDone(page);
  expect(await box(button)).toEqual(before.button);
});

test('the bar appears with 1 parcours but compares from 2', async ({ page }) => {
  await open(page);
  await expect(bar(page)).toHaveAttribute('data-shown', 'false');
  await buttons(page).nth(0).click();
  await expect(bar(page)).toHaveAttribute('data-shown', 'true');
  await expect(bar(page).getByText('Ajoute au moins un 2e parcours')).toBeVisible();
  await expect(bar(page).getByRole('link', { name: /^Comparer/ })).toHaveCount(0);
  await buttons(page).nth(1).click();
  await expect(bar(page).getByRole('link', { name: 'Comparer (2)' })).toBeVisible();
  await expect(bar(page).getByText('Ajoute au moins un 2e parcours')).toHaveCount(0);
});

test('3 at most: the 4th is disabled, shakes and says why', async ({ page }) => {
  await open(page);
  for (const i of [0, 1, 2]) await press(buttons(page).nth(i));
  const fourth = buttons(page).nth(3);
  await expect(fourth).toHaveAttribute('aria-disabled', 'true');
  await expect(fourth).toHaveAttribute('title', '3 parcours au maximum');
  await press(fourth, true);
  await expect(fourth).toHaveAttribute('data-shake', /[01]/);
  await expect(bar(page).getByRole('status')).toHaveText(
    'Retire un parcours pour en ajouter un autre',
  );
  await expect(fourth).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('À comparer (3/3) :')).toBeVisible();
  // Removing one frees the 4th
  await press(buttons(page).nth(0));
  await expect(fourth).not.toHaveAttribute('aria-disabled', 'true');
});

test('with reduced motion, a plain change of state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const button = buttons(page).first();
  await button.click();
  const anim = await button.evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe('none');
  const tick = await button
    .locator('.nm-cmp-tick')
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  // The global reduced-motion rule leaves 0.01 ms: nothing visible.
  expect(parseFloat(tick)).toBeLessThan(0.001);
});

test('/comparer with 0 or 1 parcours: an empty state, never an empty table', async ({ page }) => {
  await page.goto('/comparer');
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByText('Choisis 2 ou 3 parcours à comparer')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Choisir dans Explorer' })).toHaveAttribute(
    'href',
    '/explorer',
  );
  await expect(page.getByRole('link', { name: 'Mes masters suivis' })).toHaveAttribute(
    'href',
    '/espace/suivis',
  );

  await page.goto('/comparer?ids=valorisation-des-nouveaux-patrimoines');
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByText('Ajoute au moins un 2e parcours')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Choisir dans Explorer' })).toHaveAttribute(
    'href',
    '/explorer?comparer=valorisation-des-nouveaux-patrimoines',
  );
});
