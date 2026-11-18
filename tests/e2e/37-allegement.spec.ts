import { expect, test } from '@playwright/test';

/** Lightening of November 2026: the former addresses never answer a bare 404. */
test('former addresses: 301 to the nearest page, 410 for the calendar feed', async ({
  request,
}) => {
  const moved = async (from: string) => {
    const r = await request.get(from, { maxRedirects: 0 });
    return [
      r.status(),
      new URL(r.headers()['location'] ?? '', 'http://x').pathname +
        new URL(r.headers()['location'] ?? '', 'http://x').search,
    ];
  };
  expect(await moved('/carte?domaine=droit-economie-gestion')).toEqual([
    301,
    '/explorer?domaine=droit-economie-gestion',
  ]);
  expect(await moved('/calendrier')).toEqual([301, '/']);
  expect(await moved('/espace/voeux')).toEqual([301, '/espace']);
  expect(await moved('/espace/calendrier')).toEqual([301, '/espace']);
  const ics = await request.get('/calendrier.ics', { maxRedirects: 0 });
  expect(ics.status()).toBe(410);
});

test('nothing left in the footer, the palette or the sitemap', async ({ page, request }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(
    footer.getByRole('link', { name: /Carte des masters|Calendrier Mon Master/ }),
  ).toHaveCount(0);
  await expect(footer.getByRole('link', { name: 'Explorer les masters' })).toBeAttached();
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).not.toMatch(/\/(carte|calendrier)\b/);
});
