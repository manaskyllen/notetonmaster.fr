import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './helpers';

/**
 * The name written like the logo: in the visible text, « notetonmaster » is
 * always the BrandName component (« note ton » + « master » on lime), never the plain word. The
 * component splits the name over three text nodes, so a text node that holds the whole word is a
 * text written without it. Exceptions, not checked here: <title>, metadata, alt and aria-label,
 * addresses (dpo@notetonmaster.example), plain-text mails.
 */
const PAGES = [
  '/',
  '/explorer',
  '/explorer?q=Paris',
  '/explorer?q=Lyon',
  '/comparer',
  '/a-propos',
  '/legal/mentions-legales',
  '/legal/cgu',
  '/legal/confidentialite',
  '/legal/charte',
  '/connexion',
  '/avis/nouveau',
  '/parcours/valorisation-des-nouveaux-patrimoines',
  '/mentions/culture-patrimoine-et-mediation',
  '/universites/nantes-universite',
  '/pas-encore?ville=Paris',
  '/parcours/evenementiel-mediation-des-arts-et-des-sciences',
];

/** Text nodes of the page that write the name as a plain word. */
function plainNames(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest('script, style, noscript, template, title, nextjs-portal')) continue;
      if (/(?<![\w@./-])notetonmaster(?![\w@-]|\.[a-z])/.test(n.textContent ?? ''))
        out.push(`<${el.tagName.toLowerCase()}> ${n.textContent!.trim().slice(0, 120)}`);
    }
    return out;
  });
}

test('visible text: the name is always the BrandName component', async ({ page }) => {
  test.setTimeout(180_000);
  for (const url of PAGES) {
    await page.goto(url);
    await waitForHydration(page);
    expect(await plainNames(page), url).toEqual([]);
  }
  // and it is there: footer (small) and the « pas encore » title (large)
  await page.goto('/explorer?q=Paris');
  await expect(page.locator('footer .brand-s')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2 }).locator('.brand')).toHaveCount(1);
  // the exceptions keep the plain word
  await expect(page).toHaveTitle(/notetonmaster/);
  await expect(page.getByRole('link', { name: 'notetonmaster, accueil' })).toBeVisible();
});

test('one word, never broken: read « notetonmaster » by Chrome, no wrap, no real space', async ({
  page,
}) => {
  await page.goto('/explorer?q=Paris');
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: { role?: { value: string }; name?: { value: string } }[];
  };
  const names = nodes.filter((n) => n.role?.value === 'heading').map((n) => n.name?.value);
  expect(names).toContain('Paris n’est pas encore sur notetonmaster');
  for (const sel of ['.brand', '.brand-s']) {
    const b = page.locator(sel).first();
    await expect(b).toHaveText('notetonmaster');
    await expect(b).toHaveCSS('white-space', 'nowrap');
  }
  // the large one: « master » on a lime block tilted −3° (its background)
  await expect(page.locator('.brand .brand__m').first()).toHaveCSS(
    'background-image',
    /rotate\(-3/,
  );
  // Playwright's own reading of the name agrees with Chrome
  await expect(
    page.getByRole('heading', { name: 'Paris n’est pas encore sur notetonmaster' }),
  ).toBeVisible();
});
