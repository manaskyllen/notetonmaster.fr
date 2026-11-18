import { expect, test } from '@playwright/test';

/**
 * /a-propos#notre-robot, the page of CRAWLER_INFO_URL: the anchor exists and shows the robot's
 * contact address, the same as in its User-Agent; the legal pages show the team's address.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/;

test('the robot page: anchor, User-Agent and contact address', async ({ page }) => {
  await page.goto('/a-propos#notre-robot');
  const section = page.locator('section#notre-robot');
  await expect(section).toBeVisible();
  await expect(section.getByRole('heading', { level: 2, name: 'Notre robot' })).toBeVisible();
  await expect(section).toBeInViewport();

  const contact = section.getByTestId('robot-contact');
  const address = (await contact.textContent())?.trim() ?? '';
  expect(address).toMatch(EMAIL);
  if (process.env.CRAWLER_CONTACT_EMAIL) expect(address).toBe(process.env.CRAWLER_CONTACT_EMAIL);
  await expect(contact).toHaveAttribute('href', `mailto:${address}`);

  const ua = (await section.getByTestId('robot-user-agent').textContent()) ?? '';
  expect(ua).toMatch(/^notetonmasterBot\/1\.0 \(\+\S+#notre-robot; /);
  expect(ua).toContain(`; ${address})`);
  // How to be excluded, and how long it takes.
  await expect(section).toContainText('User-agent: notetonmasterBot');
  await expect(section).toContainText('sous 24 h');
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
