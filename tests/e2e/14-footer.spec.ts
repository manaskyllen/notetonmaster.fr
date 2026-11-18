import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { animationsDone, loginAdmin, waitForHydration } from './helpers';
import { databaseUrl, STACK } from './stack';

/** Footer: where it shows, its figures, theme selector, links, a11y. */

/** The footer's figures: the published perimeter, i.e. the open cities only (part 9.2). */
async function dbFigures() {
  // A production build leaves the demo reviews out of the count (lib/domain/footer-stats.ts).
  const demoReviews = STACK ? 'AND NOT r."isDemo"' : '';
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ p: string; u: string; m: string; r: string }>(`
      SELECT (SELECT count(*) FROM "Program" p JOIN "University" u ON u.id = p."universityId"
                JOIN "Mention" m ON m.id = p."mentionId"
               WHERE p."isPublished" AND p."inOpenZone" AND p.status IN ('ACTIVE','NOT_RENEWED') AND u.sector = 'PUBLIC'
                 AND u."isPublished" AND m."isPublished") AS p,
             (SELECT count(DISTINCT p."universityId") FROM "Program" p JOIN "University" u ON u.id = p."universityId"
                JOIN "Mention" m ON m.id = p."mentionId"
               WHERE p."isPublished" AND p."inOpenZone" AND p.status IN ('ACTIVE','NOT_RENEWED') AND u.sector = 'PUBLIC'
                 AND u."isPublished" AND m."isPublished") AS u,
             (SELECT count(DISTINCT p."mentionId") FROM "Program" p JOIN "University" u ON u.id = p."universityId"
                JOIN "Mention" m ON m.id = p."mentionId"
               WHERE p."isPublished" AND p."inOpenZone" AND p.status IN ('ACTIVE','NOT_RENEWED') AND u.sector = 'PUBLIC'
                 AND u."isPublished" AND m."isPublished") AS m,
             (SELECT count(*) FROM "Review" r JOIN "Program" p ON p.id = r."programId"
               WHERE r.status = 'PUBLISHED' AND p."inOpenZone" ${demoReviews}) AS r`);
    const r = rows[0]!;
    return [r.p, r.u, r.m, r.r].map(Number);
  } finally {
    await client.end();
  }
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
const footer = (page: Page) => page.locator('footer.ft');

async function aParcours(page: Page) {
  await page.goto('/explorer');
  const href = await page.locator('a[href^="/parcours/"]').first().getAttribute('href');
  return href!;
}

test('the footer is on public pages, not on the review form nor in the admin', async ({ page }) => {
  for (const path of ['/', '/explorer', await aParcours(page), '/a-propos']) {
    await page.goto(path);
    await expect(footer(page), path).toHaveCount(1);
    await expect(footer(page).getByRole('heading', { name: 'Pied de page' })).toBeAttached();
  }
  await page.goto('/avis/nouveau');
  await waitForHydration(page);
  await expect(footer(page)).toHaveCount(0);
  await loginAdmin(page);
  await expect(footer(page)).toHaveCount(0);
});

test('figures count up to the values of the database', async ({ page }) => {
  const expected = await dbFigures();
  await page.goto('/a-propos');
  await waitForHydration(page);
  const nums = footer(page).locator('.ft-num');
  // Labels are stable from the first byte, whatever the animation does.
  for (const [i, v] of expected.entries())
    await expect(nums.nth(i)).toHaveAttribute('aria-label', new RegExp(`^${fmt(v)} `));
  await footer(page).scrollIntoViewIfNeeded();
  await expect(footer(page)).toHaveClass(/shown/);
  for (const [i, v] of expected.entries()) await expect(nums.nth(i)).toHaveText(fmt(v));
});

test('with reduced motion the final values are there from the start', async ({ browser }) => {
  const expected = await dbFigures();
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/a-propos');
  await waitForHydration(page);
  await expect(footer(page)).not.toHaveClass(/armed/);
  const nums = footer(page).locator('.ft-num');
  for (const [i, v] of expected.entries()) await expect(nums.nth(i)).toHaveText(fmt(v));
  await expect(footer(page).locator('.ft-live')).toHaveCSS('animation-name', 'none');
  await ctx.close();
});

test('no horizontal scroll at 320, 390 and 1440 px', async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/a-propos');
    await footer(page).scrollIntoViewIfNeeded();
    const r = await page.evaluate(() => {
      const wm = document.querySelector('.ft-wm')!;
      const spans = [...wm.children].map((c) => c.getBoundingClientRect());
      return {
        scroll: document.documentElement.scrollWidth,
        left: spans[0]!.left,
        right: spans.at(-1)!.right,
      };
    });
    expect(r.scroll, `${width}px`).toBeLessThanOrEqual(width);
    // The giant logo fits in the width.
    expect(r.left, `${width}px`).toBeGreaterThanOrEqual(0);
    expect(r.right, `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('the theme selector works with the keyboard and survives a reload', async ({ page }) => {
  await page.goto('/a-propos');
  await waitForHydration(page);
  const group = footer(page).getByRole('radiogroup', { name: 'Thème' });
  await expect(group.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
  await group.getByRole('radio', { name: 'Auto' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(group.getByRole('radio', { name: 'Sombre' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(group.getByRole('radio', { name: 'Sombre' })).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await waitForHydration(page);
  await expect(footer(page).getByRole('radio', { name: 'Clair' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Tab'); // moves on; then back to Auto for the next tests
  await footer(page).getByRole('radio', { name: 'Auto' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
});

test('every footer link answers without 404', async ({ page, request }) => {
  await page.goto('/a-propos');
  const hrefs = await footer(page)
    .locator('a[href]')
    .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')!))]);
  expect(hrefs.length).toBeGreaterThanOrEqual(11);
  for (const href of hrefs) {
    const res = await request.get(href.split('#')[0]!);
    expect(res.status(), href).toBeLessThan(400);
  }
});

test('no axe violation in the footer', async ({ page }) => {
  await page.goto('/a-propos');
  await waitForHydration(page);
  await footer(page).scrollIntoViewIfNeeded();
  await expect(footer(page)).toHaveClass(/shown/);
  // Let the entrance animation end (axe reads the final colours).
  await animationsDone(footer(page));
  const results = await new AxeBuilder({ page })
    .include('footer.ft')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
