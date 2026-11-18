import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_BANNER } from '@/lib/domain/banner';
import { loginAdmin, MODERATOR, sql, waitForHydration } from './helpers';

/** Part D: the information banner and Paramètres › Bandeau d'information. */
const banner = (page: Page) => page.getByRole('region', { name: 'Information de l’équipe' });
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const shift = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toLocaleDateString('sv-SE', {
    timeZone: 'Europe/Paris',
  });

test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ browser }) => {
  // back to the starting banner, through the screen (it expires the cached banner)
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAdmin(page);
  await save(page, { message: DEFAULT_BANNER.message, tone: 'Information', from: '2026-11-14' });
  await ctx.close();
});

async function openBannerTab(page: Page) {
  await page.goto('/admin/parametres');
  await waitForHydration(page);
  await page.getByRole('tab', { name: 'Bandeau d’information' }).click();
  return page.getByRole('tabpanel', { name: 'Bandeau d’information' });
}

/** Fills the form and saves; returns the panel. */
async function save(
  page: Page,
  o: {
    message?: string;
    tone?: string;
    from?: string;
    to?: string;
    scope?: string;
    on?: boolean;
    dismissible?: boolean;
  } = {},
) {
  const tab = await openBannerTab(page);
  if (o.message !== undefined) await tab.getByLabel('Message').fill(o.message);
  if (o.tone) await tab.getByRole('radio', { name: o.tone }).click();
  await tab.getByLabel('Du', { exact: true }).fill(o.from ?? today());
  await tab.getByLabel('Au (facultatif)').fill(o.to ?? '');
  await tab.getByLabel('Afficher sur').selectOption(o.scope ?? 'ALL');
  const sw = tab.getByRole('switch', { name: 'Afficher le bandeau' });
  if ((await sw.getAttribute('aria-checked')) !== String(o.on ?? true)) await sw.click();
  const box = tab.getByLabel('Les visiteurs peuvent le fermer');
  if ((await box.isChecked()) !== (o.dismissible ?? true)) await box.click();
  await tab.getByRole('button', { name: 'Enregistrer le bandeau' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Bandeau enregistré.' })).toBeVisible();
  return tab;
}

test('validation: incomplete link, address not https, dates in the wrong order, 160 characters', async ({
  page,
}) => {
  await loginAdmin(page);
  const tab = await openBannerTab(page);
  await tab.getByLabel('Texte du lien (facultatif)').fill('En savoir plus');
  await tab.getByLabel('Adresse du lien').fill('');
  await tab.getByRole('button', { name: 'Enregistrer le bandeau' }).click();
  await expect(
    tab.getByText('Le lien doit avoir un texte et une adresse, ou rester vide.'),
  ).toBeVisible();
  await tab.getByLabel('Adresse du lien').fill('http://exemple.fr');
  await tab.getByRole('button', { name: 'Enregistrer le bandeau' }).click();
  await expect(
    tab.getByText('Adresse interne commençant par / ou adresse https://.'),
  ).toBeVisible();
  await tab.getByLabel('Adresse du lien').fill('/a-propos');
  await tab.getByLabel('Du', { exact: true }).fill(shift(5));
  await tab.getByLabel('Au (facultatif)').fill(shift(1));
  await tab.getByRole('button', { name: 'Enregistrer le bandeau' }).click();
  await expect(tab.getByText('La date de fin doit suivre la date de début.')).toBeVisible();
  const msg = tab.getByLabel('Message');
  await msg.fill('x'.repeat(170));
  await expect(msg).toHaveValue('x'.repeat(160));
  await expect(tab.getByText('160 / 160')).toHaveCSS('color', 'rgb(179, 49, 26)');
  // the preview follows the form, with its status
  await tab.getByLabel('Du', { exact: true }).fill(shift(3));
  await tab.getByLabel('Au (facultatif)').fill('');
  await expect(page.getByRole('region', { name: 'Aperçu' }).getByRole('status')).toHaveText(
    'Programmé',
  );
});

test('visibility follows active, the dates and the scope; never on the review form, login, admin', async ({
  page,
  context,
}) => {
  await loginAdmin(page);
  const visitor = await context.browser()!.newPage();
  await save(page, { message: 'Message de test : tout le site', tone: 'Information' });
  for (const p of ['/', '/explorer', '/parcours/valorisation-des-nouveaux-patrimoines']) {
    await visitor.goto(p);
    await expect(banner(visitor)).toContainText('Message de test : tout le site');
  }
  for (const p of ['/avis/nouveau', '/connexion']) {
    await visitor.goto(p);
    await expect(banner(visitor)).toHaveCount(0);
  }
  await page.goto('/admin');
  await expect(banner(page)).toHaveCount(0);

  await save(page, { message: 'Message de test : accueil', scope: 'HOME' });
  await visitor.goto('/');
  await expect(banner(visitor)).toContainText('Message de test : accueil');
  await visitor.goto('/explorer');
  await expect(banner(visitor)).toHaveCount(0);

  await save(page, { message: 'Message de test : programmé', from: shift(2) });
  await visitor.goto('/');
  await expect(banner(visitor)).toHaveCount(0);
  await save(page, { message: 'Message de test : terminé', from: shift(-5), to: shift(-1) });
  await visitor.goto('/');
  await expect(banner(visitor)).toHaveCount(0);
  await save(page, { message: 'Message de test : masqué', on: false });
  await visitor.goto('/');
  await expect(banner(visitor)).toHaveCount(0);
  await visitor.close();

  const [log] = await sql<{ detail: string }>(
    `SELECT detail FROM "AuditLog" WHERE "objectLabel" = 'Bandeau d’information' ORDER BY at DESC LIMIT 1`,
  );
  expect(log!.detail).toMatch(
    /^Avant : \{.*"message":"Message de test : terminé".*\} · Après : \{.*"active":false/,
  );
});

test('closed: stays closed after a reload, back when the message changes', async ({
  page,
  context,
}) => {
  await loginAdmin(page);
  await save(page, { message: 'Message de test : à fermer' });
  const visitor = await context.browser()!.newPage();
  await visitor.goto('/');
  await waitForHydration(visitor);
  await banner(visitor).getByRole('button', { name: 'Masquer ce message' }).click();
  await expect(banner(visitor)).toHaveCount(0);
  await visitor.reload();
  // hidden before the first paint by the inline script
  await expect(visitor.locator('html')).toHaveAttribute('data-banner-closed', '');
  await expect(banner(visitor)).toBeHidden();
  await save(page, { message: 'Message de test : nouveau message' });
  await visitor.reload();
  await expect(banner(visitor)).toBeVisible();
  await expect(banner(visitor)).toContainText('nouveau message');
  await visitor.close();
});

test('refused to other roles, on the server', async ({ page, browser }) => {
  // the request of a real save by the admin…
  await loginAdmin(page);
  const tab = await openBannerTab(page);
  const req = page.waitForRequest((r) => r.method() === 'POST' && !!r.headers()['next-action']);
  await tab.getByRole('button', { name: 'Enregistrer le bandeau' }).click();
  const r = await req;
  // …replayed by a moderator: refused by the action itself
  const ctx = await browser.newContext();
  const mod = await ctx.newPage();
  await loginAdmin(mod, MODERATOR);
  await mod.goto('/admin/parametres');
  await expect(mod).toHaveURL(/\/admin\?refus=1/);
  // Sent from the site itself (a request from another origin is refused earlier, by proxy.ts).
  const res = await mod.request.post(r.url(), {
    headers: {
      origin: new URL(r.url()).origin,
      'next-action': r.headers()['next-action']!,
      'content-type': r.headers()['content-type'] ?? 'text/plain;charset=UTF-8',
      accept: 'text/x-component',
    },
    data: r.postData() ?? '',
  });
  const body = await res.text();
  expect(body).toContain('"ok":false');
  expect(body).not.toContain('Bandeau enregistré');
  await ctx.close();
});

test('axe: home page with the banner in the three tones', async ({ page, browser }) => {
  await loginAdmin(page);
  const visitorCtx = await browser.newContext();
  const visitor = await visitorCtx.newPage();
  for (const tone of ['Information', 'Important', 'Alerte']) {
    await save(page, { message: `Message de test en ton ${tone}`, tone });
    await visitor.goto('/');
    await waitForHydration(visitor);
    await expect(banner(visitor)).toContainText(tone);
    const results = await new AxeBuilder({ page: visitor })
      .include('[aria-label="Information de l’équipe"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${tone}: ${v.id}`)).toEqual([]);
  }
  await visitorCtx.close();
});
