import { expect, test } from '@playwright/test';
import { waitForHydration } from './helpers';

/**
 * /a-propos#notre-robot, the page of CRAWLER_INFO_URL: the anchor exists and shows the robot's
 * contact address, the same as in its User-Agent; the legal pages show the team's address.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/;

test('the robot page: anchor, User-Agent and contact address', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/a-propos#notre-robot');
  const section = page.locator('section#notre-robot');
  await expect(section).toBeVisible();
  const h2 = section.getByRole('heading', { level: 2, name: 'Notre robot' });
  await expect(h2).toBeVisible();
  await expect(section).toBeInViewport();
  // Not hidden under the sticky header (scroll-margin-top).
  const header = await page.locator('header').first().boundingBox();
  const title = await h2.boundingBox();
  expect(title!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  // One h2, then an h3 per card and per block.
  for (const name of [
    'Ce qu’il lit',
    'Comment il se comporte',
    'Le reconnaître dans vos journaux',
    'Exclure votre site',
  ])
    await expect(section.getByRole('heading', { level: 3, name })).toBeVisible();
  await expect(section.getByRole('heading', { level: 1 })).toHaveCount(0);

  const contact = section.getByTestId('robot-contact');
  const address = (await contact.textContent())?.trim() ?? '';
  expect(address).toMatch(EMAIL);
  if (process.env.CRAWLER_CONTACT_EMAIL) expect(address).toBe(process.env.CRAWLER_CONTACT_EMAIL);
  await expect(contact).toHaveAttribute('href', `mailto:${address}`);
  await expect(section.getByRole('link', { name: `Écrire à ${address}` })).toHaveAttribute(
    'href',
    `mailto:${address}?subject=Exclure%20notre%20site`,
  );

  const ua = (await section.getByTestId('robot-user-agent').textContent()) ?? '';
  expect(ua).toMatch(/^notetonmasterBot\/1\.0 \(\+\S+#notre-robot; /);
  expect(ua).toContain(`; ${address})`);
  // How to be excluded, and how long it takes.
  await expect(section).toContainText('User-agent: notetonmasterBot');
  await expect(section).toContainText('sous 24 h');
  await expect(section).toContainText('sous 72 h');
  // The frequencies come from the schedule of the sources: the universities every night.
  await expect(
    section.getByRole('listitem').filter({ hasText: 'Sites des universités' }),
  ).toContainText('Chaque nuit');
  await expect(
    page.locator('#sources').getByRole('listitem').filter({ hasText: 'Sites des universités' }),
  ).toContainText('Mise à jour : chaque nuit, seules les pages modifiées sont relues');

  // « Copier »: the User-Agent and the two lines of robots.txt, « Copié ✓ » for 2 seconds.
  await waitForHydration(page);
  const copyUa = section.getByRole('button', { name: 'Copier le User-Agent' });
  await copyUa.click();
  await expect(copyUa).toHaveText('Copié ✓');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ua);
  await expect(copyUa).toHaveText('Copier', { timeout: 4000 });
  await section.getByRole('button', { name: 'Copier les lignes de robots.txt' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'User-agent: notetonmasterBot\nDisallow: /',
  );
});

test('the robot section without JavaScript: no « Copier » button, the text stays', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/a-propos#notre-robot');
  const section = page.locator('section#notre-robot');
  await expect(section.getByTestId('robot-user-agent')).toBeVisible();
  await expect(section.getByRole('button')).toHaveCount(0);
  await context.close();
});

for (const width of [320, 390, 1024])
  test(`the robot section at ${width} px: no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/a-propos#notre-robot');
    await expect(page.locator('section#notre-robot')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

test('the legal pages show the contact address, never a placeholder', async ({ page }) => {
  for (const doc of ['mentions-legales', 'confidentialite']) {
    await page.goto(`/legal/${doc}`);
    const link = page.locator('article a[href^="mailto:"]').first();
    const address = (await link.textContent())?.trim() ?? '';
    expect(address).toMatch(EMAIL);
    if (process.env.CONTACT_EMAIL) expect(address).toBe(process.env.CONTACT_EMAIL);
    await expect(page.locator('article')).not.toContainText('{{');
  }
});
