import { test } from '@playwright/test';
import { loginAdmin, loginStudent, waitForHydration } from '../e2e/helpers';

/**
 * Screenshots of logged-in pages into .shots/, for a visual check by hand (project « visual »,
 * VISUAL=1, never in the end-to-end suite). SHOTS_EXTRA=/admin/avis,/admin/equipe adds pages.
 */

test('student space screenshots', async ({ page }) => {
  await loginStudent(page, 'alexis.demo@demo.notetonmaster.local');
  await page.screenshot({ path: '.shots/espace-anna.png', fullPage: true });
  await page.locator('#messages').getByRole('button', { name: /#4F2/ }).first().click();
  await page.locator('#messages').screenshot({ path: '.shots/espace-thread.png' });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: '.shots/espace-anna-360.png', fullPage: true });
});

test('admin screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAdmin(page);
  for (const [path, name] of [
    ['/admin', 'admin-overview'],
    ['/admin/fiches', 'admin-fiches'],
    ['/admin/audit', 'admin-audit'],
    ...(process.env.SHOTS_EXTRA ?? '')
      .split(',')
      .filter(Boolean)
      .map((p) => [p, `admin${p.replace(/\//g, '-')}`]),
  ] as const) {
    await page.goto(path);
    await waitForHydration(page);
    await page.screenshot({ path: `.shots/${name}.png`, fullPage: true });
  }
});
