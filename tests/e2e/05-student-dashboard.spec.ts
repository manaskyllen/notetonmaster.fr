import { expect, test } from '@playwright/test';
import { loginStudent, uniqueEmail, waitForHydration } from './helpers';

test('Mon espace: « Répondre » opens the right conversation in the Messages tab', async ({
  page,
}) => {
  await loginStudent(page, 'alexis.demo@demo.notetonmaster.local');
  const todo = page.getByRole('region', { name: 'À faire' });
  const reply = page.getByRole('link', { name: 'Répondre' });
  await expect(reply).toBeVisible();
  const href = (await reply.getAttribute('href'))!;
  expect(href).toMatch(/^\/espace\/messages\/[a-z0-9]+$/);
  await reply.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole('tab', { name: /Messages/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Ta réponse')).toBeVisible();
  await expect(todo).toHaveCount(0);
});

test('Mon espace: follow 2 masters, tick them in « Masters suivis », compare', async ({ page }) => {
  await loginStudent(page, uniqueEmail('suivis'));
  for (const title of ['Valorisation des nouveaux patrimoines', 'Droit des affaires']) {
    // Search it first (the Explorer lists every open city).
    await page.goto(`/explorer?q=${encodeURIComponent(title)}`);
    await waitForHydration(page);
    await page
      .getByRole('button', { name: new RegExp(`^Suivre : ${title}`) })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: new RegExp(`^Ne plus suivre : ${title}`) }).first(),
    ).toHaveAttribute('aria-pressed', 'true');
    // The next search is another page: let the server action finish first.
    await page.waitForLoadState('networkidle');
  }
  await page.goto('/espace/suivis');
  // « Comparer (n) » only from 2 ticked
  await expect(page.getByText(/^Comparer \(\d\)$/)).toHaveCount(0);
  await expect(page.getByText('Coche 2 ou 3 masters pour les comparer')).toBeVisible();
  await page.getByRole('button', { name: /^Comparer : Valorisation/ }).click();
  await expect(page.getByText('Coche encore 1 master pour comparer')).toBeVisible();
  await page.getByRole('button', { name: /^Comparer : Droit des affaires/ }).click();
  await page.getByRole('link', { name: 'Comparer (2)' }).click();
  await expect(page).toHaveURL(/\/comparer\?ids=/);
  await expect(
    page.getByRole('table', { name: 'Comparaison de parcours' }).getByRole('link', {
      name: 'Valorisation des nouveaux patrimoines',
    }),
  ).toBeVisible();
});

test('Mon espace on a phone: the tabs scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginStudent(page, 'alexis.demo@demo.notetonmaster.local');
  const tabs = page.getByRole('tablist', { name: 'Sections de mon espace' });
  const box = await tabs.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
    overflow: getComputedStyle(el).overflowX,
    direction: getComputedStyle(el).flexDirection,
  }));
  expect(box.direction).toBe('row');
  expect(box.overflow).toBe('auto');
  expect(box.scroll).toBeGreaterThan(box.client);
  // No horizontal scroll of the page itself.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('tab', { name: 'Compte' }).click();
  await expect(page.getByRole('tab', { name: 'Compte' })).toBeInViewport();
});
