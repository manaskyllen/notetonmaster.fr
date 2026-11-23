import jsQR from 'jsqr';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, loginAdmin, sql, waitForHydration } from './helpers';

/** Scans counted today for a link (Europe/Paris). */
async function scansToday(slug: string): Promise<number> {
  const [row] = await sql<{ n: number }>(
    `SELECT COALESCE(sum(s.count), 0)::int AS n FROM "qr_scans_daily" s
       JOIN "qr_links" l ON l.id = s."link_id"
      WHERE l.slug = $1 AND s.day = (now() AT TIME ZONE 'Europe/Paris')::date`,
    [slug],
  );
  return row!.n;
}

/** Reads a downloaded SVG the way a phone reads the printed code: drawn, then decoded. */
async function decodeSvg(page: Page, svg: string): Promise<string | null> {
  const img = await page.evaluate(async (src) => {
    const el = new Image();
    el.src = `data:image/svg+xml;base64,${btoa(src)}`;
    await el.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 600;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(el, 0, 0, 600, 600);
    return [...ctx.getImageData(0, 0, 600, 600).data];
  }, svg);
  return jsQR(new Uint8ClampedArray(img), 600, 600)?.data ?? null;
}

/**
 * Short links of the QR codes (issue #17): created in the admin, /q/{slug} counts a scan and
 * redirects to a clean address, the target can change, unknown or archived links go home.
 */
test('QR codes: creation, redirect, counter, change of target, archiving', async ({
  page,
  baseURL,
}) => {
  const slug = `e2e-${Date.now().toString(36)}`;
  await loginAdmin(page, ADMIN);
  await page.goto('/admin/qr');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'QR codes', level: 1 })).toBeVisible();

  // The slug is proposed from the label, and can be changed.
  await page.getByLabel('Libellé').fill('Sous-bock vert · Nantes');
  await expect(page.getByLabel('Adresse courte')).toHaveValue('sous-bock-vert-nantes');
  await page.getByLabel('Adresse courte').fill(slug);

  // An external or tricky target is refused.
  await page.getByLabel('Cible').selectOption({ label: 'Chemin interne' });
  for (const bad of [
    'https://exemple.fr',
    '//exemple.fr',
    '/\\exemple.fr',
    'javascript:alert(1)',
  ]) {
    await page.getByLabel('Chemin interne').fill(bad);
    await page.getByRole('button', { name: 'Créer le lien' }).click();
    await expect(page.getByText(/Cible refusée/)).toBeVisible();
  }
  expect(await sql(`SELECT 1 FROM "qr_links" WHERE slug = $1`, [slug])).toEqual([]);

  await page.getByLabel('Cible').selectOption({ label: 'Formulaire d’avis' });
  await page.getByRole('button', { name: 'Créer le lien' }).click();
  await expect(page.getByText(`Lien /q/${slug} créé.`)).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: `/q/${slug}` });
  await expect(row).toContainText('/avis/nouveau');

  // A scan: the target, its clean address, one more in the counter of the day.
  await page.goto(`/q/${slug}`);
  await expect(page).toHaveURL(`${baseURL}/avis/nouveau`);
  await expect.poll(() => scansToday(slug)).toBe(1);
  const answer = await page.request.get(`/q/${slug}`, { maxRedirects: 0 });
  expect(answer.status()).toBe(302);
  expect(answer.headers()['location']).toBe('/avis/nouveau');
  expect(answer.headers()['cache-control']).toBe('no-store');
  expect(answer.headers()['x-robots-tag']).toMatch(/noindex/);
  await expect.poll(() => scansToday(slug)).toBe(2);

  // Not counted: HEAD, a prefetch, a robot or a link preview.
  expect((await page.request.head(`/q/${slug}`, { maxRedirects: 0 })).status()).toBe(302);
  await page.request.get(`/q/${slug}`, {
    maxRedirects: 0,
    headers: { 'Sec-Purpose': 'prefetch' },
  });
  for (const ua of ['WhatsApp/2.23.20.0', 'Mozilla/5.0 (compatible; Googlebot/2.1)'])
    await page.request.get(`/q/${slug}`, { maxRedirects: 0, headers: { 'User-Agent': ua } });
  // Counting happens after the answer: leave it the time it would take.
  await page.waitForTimeout(500);
  expect(await scansToday(slug)).toBe(2);

  // The same code, a new target.
  await page.goto('/admin/qr');
  await waitForHydration(page);
  await row.getByRole('button', { name: /^Modifier/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cible').selectOption({ label: 'Page d’une ville' });
  const city = dialog.getByLabel('Ville ouverte');
  const citySlug = await city.locator('option').nth(1).getAttribute('value');
  await city.selectOption(citySlug!);
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Lien enregistré.')).toBeVisible();
  await page.goto(`/q/${slug}`);
  await expect(page).toHaveURL(`${baseURL}/masters/${citySlug}`);
  await expect.poll(() => scansToday(slug)).toBe(3);

  // The SVG for the printer scans to the short address.
  const [link] = await sql<{ id: string }>(`SELECT id FROM "qr_links" WHERE slug = $1`, [slug]);
  const svg = await page.request.get(`/admin/qr/${link!.id}/code`);
  expect(svg.headers()['content-type']).toMatch(/image\/svg\+xml/);
  expect(await decodeSvg(page, await svg.text())).toBe(`${baseURL}/q/${slug}`);
  const png = await page.request.get(`/admin/qr/${link!.id}/code?format=png`);
  expect(png.headers()['content-type']).toBe('image/png');

  // The detail: scans per day.
  await page.goto(`/admin/qr/${link!.id}`);
  await expect(
    page.getByRole('heading', { name: /Scans des 90 derniers jours : 3/ }),
  ).toBeVisible();

  // Archived: home page, not counted; the slug cannot be taken again.
  await page.goto('/admin/qr');
  await waitForHydration(page);
  await row.getByRole('button', { name: /^Archiver/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archiver' }).click();
  await expect(page.getByText(/archivé : ses scans mènent désormais à l’accueil/)).toBeVisible();
  await page.goto(`/q/${slug}`);
  await expect(page).toHaveURL(`${baseURL}/`);
  await page.waitForTimeout(500);
  expect(await scansToday(slug)).toBe(3);
  await page.goto('/admin/qr');
  await waitForHydration(page);
  await page.getByLabel('Libellé').fill('Autre support');
  await page.getByLabel('Adresse courte').fill(slug);
  await page.getByRole('button', { name: 'Créer le lien' }).click();
  await expect(page.getByText(/existe déjà \(ou a déjà servi\)/)).toBeVisible();
});

test('unknown short link: the home page, nothing counted, nothing stored about the visitor', async ({
  page,
  baseURL,
}) => {
  const before = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "qr_scans_daily"`);
  await page.goto('/q/lien-inconnu-e2e');
  await expect(page).toHaveURL(`${baseURL}/`);
  await page.waitForTimeout(500);
  expect(await sql(`SELECT count(*)::int AS n FROM "qr_scans_daily"`)).toEqual(before);
  // The two tables hold no IP, user agent, referrer nor identifier of a visitor.
  const columns = await sql<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_name IN ('qr_links', 'qr_scans_daily') ORDER BY table_name, ordinal_position`,
  );
  expect(columns.map((c) => `${c.table_name}.${c.column_name}`)).toEqual([
    'qr_links.id',
    'qr_links.slug',
    'qr_links.label',
    'qr_links.target_path',
    'qr_links.created_at',
    'qr_links.updated_at',
    'qr_links.archived_at',
    'qr_scans_daily.link_id',
    'qr_scans_daily.day',
    'qr_scans_daily.count',
  ]);
});
