import { expect, test, type Page } from '@playwright/test';
import { loginStudent, uniqueEmail, waitForHydration } from './helpers';

/** Draft of « Donner mon avis ». */
const VNP = 'valorisation-des-nouveaux-patrimoines';
const VNP_TITLE = 'Valorisation des nouveaux patrimoines';
// Another parcours of an open city.
const OTHER = 'histoire-de-l-art-et-culture-materielle';

async function openForm(page: Page, slug?: string) {
  await page.goto(`/avis/nouveau${slug ? `?parcours=${slug}` : ''}`);
  await waitForHydration(page);
}
const banner = (page: Page) => page.getByText('Brouillon restauré ·');
const m1 = (page: Page) => page.getByRole('radio', { name: 'En M1' });

/** Step 1 started: the level only (enough to make a draft). */
async function startDraft(page: Page, slug = VNP) {
  await openForm(page, slug);
  await m1(page).click();
  await expect(m1(page)).toBeChecked();
  // Written on the next effect: wait for the key.
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('avis:')).length),
    )
    .toBeGreaterThan(0);
}

test('a draft comes back on the same master, with « Brouillon restauré · Effacer »', async ({
  page,
}) => {
  await startDraft(page);
  await openForm(page, VNP);
  await expect(banner(page)).toBeVisible();
  await expect(m1(page)).toBeChecked();
  const stored = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('avis:'))!;
    return { k, v: JSON.parse(localStorage.getItem(k)!) };
  });
  expect(stored.k).toMatch(new RegExp(`^avis:s-[0-9a-f-]+:${VNP}$`));
  expect(stored.v.v).toBe(2);
  expect(stored.v.step).toBe(1);
  await page.getByRole('button', { name: 'Effacer' }).click();
  await expect(m1(page)).not.toBeChecked();
  await openForm(page, VNP);
  await expect(banner(page)).toHaveCount(0);
});

test('an old draft version is ignored', async ({ page }) => {
  await openForm(page, VNP);
  await page.evaluate((slug) => {
    sessionStorage.setItem('nm-review-draft', JSON.stringify({ d: { level: 'M2' }, step: 3 }));
    const owner = sessionStorage.getItem('avis-session');
    localStorage.setItem(
      `avis:${owner}:${slug}`,
      JSON.stringify({ v: 1, step: 3, fields: { level: 'M2' } }),
    );
  }, VNP);
  await openForm(page, VNP);
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ton master', level: 1 })).toBeVisible();
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('avis:'))),
  ).toEqual([]);
});

test('draft of X, form opened for Y: the question, then « Commencer pour Y »', async ({ page }) => {
  await startDraft(page, VNP);
  await openForm(page, OTHER);
  await expect(
    page.getByRole('heading', { name: `Tu as un brouillon pour ${VNP_TITLE}. Le reprendre ?` }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Commencer pour/ }).click();
  await expect(m1(page)).not.toBeChecked();
  await expect(banner(page)).toHaveCount(0);
  await openForm(page, VNP);
  await expect(banner(page)).toHaveCount(0);
});

test('draft of X, form opened for Y: « Reprendre » goes back to X', async ({ page }) => {
  await startDraft(page, VNP);
  await openForm(page, OTHER);
  await page.getByRole('button', { name: 'Reprendre' }).click();
  await expect(banner(page)).toBeVisible();
  await expect(m1(page)).toBeChecked();
  await expect(page).toHaveURL(new RegExp(`parcours=${VNP}`));
  await expect(page.getByText(VNP_TITLE).first()).toBeVisible();
});

test('a draft expires after 24 hours (simulated clock)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-16T09:00:00+01:00') });
  await startDraft(page);
  await page.clock.setSystemTime(new Date('2026-11-17T08:30:00+01:00'));
  await openForm(page, VNP);
  await expect(banner(page)).toBeVisible();
  await page.clock.setSystemTime(new Date('2026-11-17T09:30:00+01:00'));
  await openForm(page, VNP);
  await expect(banner(page)).toHaveCount(0);
  await expect(m1(page)).not.toBeChecked();
});

test('« Quitter » with fields filled asks; « Effacer » removes the draft', async ({ page }) => {
  await startDraft(page);
  await page.getByRole('link', { name: 'Quitter' }).click();
  const dialog = page.getByRole('dialog', { name: 'Garder ton brouillon ?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Effacer' }).click();
  await expect(page).toHaveURL(new RegExp(`/parcours/${VNP}$`));
  await openForm(page, VNP);
  await expect(banner(page)).toHaveCount(0);
});

test('logout erases the drafts of the account', async ({ page }) => {
  const email = uniqueEmail('brouillon-logout');
  await loginStudent(page, email);
  await startDraft(page);
  expect(
    await page.evaluate(
      () => Object.keys(localStorage).filter((k) => k.startsWith('avis:c-')).length,
    ),
  ).toBe(1);
  await page.goto('/espace');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/$/);
  await waitForHydration(page);
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('avis:')).length),
    )
    .toBe(0);
  await loginStudent(page, email);
  await openForm(page, VNP);
  await expect(banner(page)).toHaveCount(0);
});

test('after a review is sent, the form opens empty (and Back does not restore it)', async ({
  page,
}) => {
  await loginStudent(page, uniqueEmail('brouillon-envoi'));
  await startDraft(page);
  await page.getByLabel('Entré·e en').selectOption(String(new Date().getFullYear() - 1));
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page
    .getByRole('radiogroup', { name: 'Note globale' })
    .getByRole('radio', { name: '4 sur 5' })
    .click();
  await page
    .getByLabel('Ce que tu as aimé')
    .fill('Les ateliers de terrain sont concrets et bien encadrés.');
  await page
    .getByLabel('Ce que tu n’as pas aimé')
    .fill('Les emplois du temps arrivent souvent trop tard.');
  await page.getByLabel('Ton master en une phrase').fill('Du terrain, peu d’anticipation');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel(/je respecte la/).check();
  await page.getByRole('button', { name: 'Envoyer mon avis' }).click();
  await expect(page.getByRole('heading', { name: 'Merci, c’est envoyé !' })).toBeVisible();
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('avis:'))),
  ).toEqual([]);

  await page.goBack();
  await page.goForward();
  await waitForHydration(page);
  await expect(banner(page)).toHaveCount(0);
  await openForm(page, OTHER);
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Le reprendre/ })).toHaveCount(0);
  await expect(m1(page)).not.toBeChecked();
});
