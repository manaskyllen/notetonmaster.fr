import { expect, test, type Page } from '@playwright/test';
import { loginStudent, uniqueEmail, waitForHydration } from './helpers';

/**
 * « Suivre » is stored in Favorite and read by the server everywhere:
 * it survives a reload, and the followed cards of Explorer show the violet border and « Suivi ».
 */
const VNP = 'valorisation-des-nouveaux-patrimoines';
const TITLE = 'Valorisation des nouveaux patrimoines';

const heroFollow = (page: Page) => page.getByRole('button', { name: 'Suivre ce master' }).first();
const card = (page: Page) =>
  page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: TITLE, exact: true }) })
    .first();

/** Clicks and waits for the Server Action (POST) to answer: the reload comes after it. */
async function clickAndSave(page: Page, target: ReturnType<Page['getByRole']>) {
  const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.ok());
  await target.click();
  await saved;
}

test('followed on the fiche: still followed after a reload, and on Explorer', async ({ page }) => {
  await loginStudent(page, uniqueEmail('suivre-fiche'));
  await page.goto(`/parcours/${VNP}`);
  await waitForHydration(page);
  await expect(heroFollow(page)).toHaveAttribute('aria-pressed', 'false');
  await clickAndSave(page, heroFollow(page));
  await expect(heroFollow(page)).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(heroFollow(page)).toHaveAttribute('aria-pressed', 'true');

  await page.goto(`/explorer?q=${encodeURIComponent(TITLE)}`);
  await expect(
    card(page).getByRole('button', { name: `Ne plus suivre : ${TITLE}` }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page).getByText('Suivi', { exact: true })).toBeVisible();
});

test('followed on Explorer: only the « Suivi » tag (no violet border), not clipped, kept after a reload', async ({
  page,
}) => {
  await loginStudent(page, uniqueEmail('suivre-explorer'));
  await page.goto(`/explorer?q=${encodeURIComponent(TITLE)}`);
  await waitForHydration(page);
  const c = card(page);
  await expect(c.getByText('Suivi', { exact: true })).toHaveCount(0);
  await clickAndSave(page, c.getByRole('button', { name: `Suivre : ${TITLE}` }));
  const tag = c.getByText('Suivi', { exact: true });
  await expect(tag).toBeVisible();
  await page.reload();
  await expect(c.getByRole('button', { name: `Ne plus suivre : ${TITLE}` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(tag).toBeVisible();
  // Computed colours, as 0–255 RGB (color-mix() comes back as « color(srgb …) »).
  const style = await c.evaluate((el) => {
    const rgb = (css: string) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    };
    const s = getComputedStyle(el);
    return { border: rgb(s.borderTopColor), bg: rgb(s.backgroundColor) };
  });
  // The tag alone marks it: no violet border nor tinted background (too much with the tag).
  expect(style.border).not.toBe('rgb(90, 59, 240)');
  expect(style.bg).not.toBe('rgb(251, 250, 255)');
  // The tag sits across the top edge: nothing above it (card, grid, section) clips it.
  const clipped = await tag.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflow === 'visible' && s.overflowY === 'visible') continue;
      const b = p.getBoundingClientRect();
      if (r.top < b.top || r.left < b.left || r.right > b.right)
        return p.tagName + '.' + p.className;
    }
    return null;
  });
  expect(clipped).toBeNull();
  await expect(tag).toBeInViewport();
  // With a margin: the tag overhangs the card.
  const box = (await c.boundingBox())!;
  await page.screenshot({
    path: test.info().outputPath('carte-suivie.png'),
    clip: { x: box.x - 16, y: box.y - 24, width: box.width + 32, height: box.height + 40 },
  });
});

test('unfollowed from Mon espace: the fiche shows it right away', async ({ page }) => {
  await loginStudent(page, uniqueEmail('suivre-espace'));
  await page.goto(`/parcours/${VNP}`);
  await waitForHydration(page);
  await clickAndSave(page, heroFollow(page));
  await page.goto('/espace/suivis');
  await waitForHydration(page);
  await clickAndSave(page, page.getByRole('button', { name: `Ne plus suivre : ${TITLE}` }));
  await page.goto(`/parcours/${VNP}`);
  await expect(heroFollow(page)).toHaveAttribute('aria-pressed', 'false');
});

test('a failed save puts the button back and says so', async ({ page }) => {
  await loginStudent(page, uniqueEmail('suivre-erreur'));
  await page.goto(`/parcours/${VNP}`);
  await waitForHydration(page);
  // The Server Action never reaches the server (network cut, deployment in between…).
  await page.route(`**/parcours/${VNP}`, (route) =>
    route.request().method() === 'POST' ? route.abort() : route.continue(),
  );
  await heroFollow(page).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'rien n’a été enregistré' }),
  ).toBeVisible();
  await expect(heroFollow(page)).toHaveAttribute('aria-pressed', 'false');
  await page.unroute(`**/parcours/${VNP}`);
  await page.reload();
  await expect(heroFollow(page)).toHaveAttribute('aria-pressed', 'false');
});

test('without account, the heart stays in the top right corner of the card', async ({ page }) => {
  await page.goto(`/explorer?q=${encodeURIComponent(TITLE)}`);
  const c = card(page);
  const heart = c.getByRole('link', { name: /^Suivre : .*\(connexion requise\)$/ });
  const [cb, hb] = [(await c.boundingBox())!, (await heart.boundingBox())!];
  // 14px inside the card's 2px border (top 14, right 14)
  expect(Math.round(cb.x + cb.width - (hb.x + hb.width))).toBe(16);
  expect(Math.round(hb.y - cb.y)).toBe(16);
});
