import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test } from '@playwright/test';
import { loginStudent, sql, uniqueEmail, waitForHydration } from './helpers';

/** « Partager » of a fiche parcours (issue #13). */
const VNP = 'valorisation-des-nouveaux-patrimoines';
const PARCOURS = 'Valorisation des nouveaux patrimoines';

test('computer: the menu loads on click, copies both links, works with the keyboard', async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`/parcours/${VNP}`);
  await waitForHydration(page);
  const hero = page.locator('section').filter({ has: page.getByRole('heading', { level: 1 }) });
  const share = hero.getByRole('button', { name: 'Partager' });
  await expect(share).toHaveAttribute('aria-expanded', 'false');

  // The menu is a chunk of its own, fetched on the first click only.
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(r.url());
  });
  await share.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('group', { name: 'Partager' });
  await expect(menu).toBeVisible();
  expect(scripts.length).toBeGreaterThan(0);
  await expect(share).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByText('Partager ce master')).toBeVisible();
  await expect(menu.getByText('Inviter ma promo à donner son avis')).toBeVisible();
  const copyButtons = menu.getByRole('button', { name: 'Copier le lien' });
  await expect(copyButtons).toHaveCount(2);
  await expect(copyButtons.first()).toBeFocused();

  const axe = await new AxeBuilder({ page })
    .include('#avis, section:has(h1)')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );

  // The fiche: its canonical address, no parameter; « Lien copié » in a live region.
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('status')).toHaveText('Lien copié');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${baseURL}/parcours/${VNP}`,
  );
  // The review form set on the parcours.
  await copyButtons.last().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${baseURL}/avis/nouveau?parcours=${VNP}`,
  );

  // Escape closes and gives the focus back.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(share).toBeFocused();
  // A click outside closes too.
  await share.click();
  await expect(menu).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(menu).toHaveCount(0);
});

test('phone: each choice opens the share sheet with its own link and text', async ({
  browser,
  baseURL,
}) => {
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 7'];
  void _;
  const context = await browser.newContext({ ...pixel, baseURL, locale: 'fr-FR' });
  await context.addInitScript(() => {
    const w = window as unknown as { __shared: ShareData[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        w.__shared.push(data);
      },
    });
  });
  const page = await context.newPage();
  await page.goto(`/parcours/${VNP}`);
  await waitForHydration(page);
  const share = page.getByRole('button', { name: 'Partager', exact: true });
  await share.click();
  await page.getByRole('button', { name: /Partager ce master/ }).click();
  await share.click();
  await page.getByRole('button', { name: /Inviter ma promo à donner son avis/ }).click();
  const shared = await page.evaluate(
    () => (window as unknown as { __shared: ShareData[] }).__shared,
  );
  expect(shared).toEqual([
    {
      title: expect.stringMatching(new RegExp(`^${PARCOURS} — .+, sur notetonmaster$`)),
      text: expect.stringMatching(new RegExp(`^${PARCOURS} — .+, sur notetonmaster$`)),
      url: `${baseURL}/parcours/${VNP}`,
    },
    {
      title: `Donne ton avis sur ${PARCOURS}`,
      text: `Tu as fait le master ${PARCOURS} ? Donne ton avis, c’est anonyme et ça aide les suivant·es.`,
      url: `${baseURL}/avis/nouveau?parcours=${VNP}`,
    },
  ]);
  await context.close();
});

test('the shared review link opens the form on the parcours, with or without an account; its preview', async ({
  page,
  request,
}) => {
  const form = `/avis/nouveau?parcours=${VNP}`;
  await page.goto(form);
  await waitForHydration(page);
  await expect(page.getByText(PARCOURS)).toBeVisible();
  await expect(page.getByRole('button', { name: /Changer/ })).toBeVisible();

  // Link preview: its own title and the image of the parcours, never indexed.
  const html = await (await request.get(form)).text();
  expect(html).toContain(`<meta property="og:title" content="Donne ton avis sur ${PARCOURS}`);
  expect(html).toMatch(/<meta property="og:image" content="[^"]*\/og\/parcours\//);
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);

  await loginStudent(page, uniqueEmail('partage'));
  await page.goto(form);
  await waitForHydration(page);
  await expect(page.getByText(PARCOURS)).toBeVisible();
  await expect(page.getByRole('button', { name: /Changer/ })).toBeVisible();
});

test('no « Partager » on a parcours outside the open cities', async ({ page }) => {
  const [closed] = await sql<{ slug: string }>(
    `SELECT slug FROM "Program" WHERE "isPublished" AND NOT "inOpenZone" ORDER BY slug LIMIT 1`,
  );
  test.skip(!closed, 'no parcours outside the open cities in the fixtures');
  const r = await page.goto(`/parcours/${closed!.slug}`);
  expect(r?.status()).toBe(404);
  await expect(page.getByRole('button', { name: 'Partager' })).toHaveCount(0);
});
