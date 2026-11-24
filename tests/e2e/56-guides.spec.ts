import { expect, test } from '@playwright/test';
import { ADMIN, loginAdmin, sql, waitForHydration } from './helpers';
import { horizontalOverflow, WIDTHS } from './responsive';

/**
 * Guides (articles): written in the admin, published on /guides/{slug}, listed on /guides and on
 * the page of their city. Fixtures: tests/e2e/fixtures/guides.ts.
 */

const GUIDE = '/guides/e2e-guide-strasbourg';

test('admin: create a guide, insert a « Classement » block, preview, publish, change its slug', async ({
  page,
}) => {
  const slug = `e2e-guide-admin-${Date.now().toString(36)}`;
  await loginAdmin(page, ADMIN);
  await page.goto('/admin/articles');
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Nouvel article' }).click();
  await expect(page.getByRole('heading', { name: 'Modifier l’article' })).toBeVisible();
  await waitForHydration(page);

  await page.getByRole('radio', { name: 'Strasbourg' }).click();
  await page
    .getByLabel('Titre (H1 et balise title)')
    .fill('Masters à Strasbourg : test de l’éditeur');
  await page.getByRole('button', { name: 'Modifier' }).click();
  await page.getByLabel('Adresse du guide').fill(slug);
  await page.getByRole('button', { name: 'Valider' }).click();
  await page.getByLabel('Chapô').fill('Un guide écrit par le test de bout en bout.');
  await page
    .getByLabel('Meta description')
    .fill(
      'Les masters les plus demandés à Strasbourg, d’après Mon Master : un guide écrit par le test de bout en bout de l’éditeur de guides.',
    );
  const body = page.getByLabel('Texte de l’article (Markdown)');
  await body.fill(
    'Strasbourg compte {{ville.parcours}} parcours.\n\n## Les plus demandés\n\n\n\n## Questions fréquentes\n\n**Combien de masters ?**\n{{ville.parcours}} parcours.',
  );
  // The caret on the empty line under « Les plus demandés », then the block menu.
  await body.evaluate((el: HTMLTextAreaElement) => {
    const at = el.value.indexOf('## Les plus demandés') + '## Les plus demandés\n\n'.length;
    el.setSelectionRange(at, at);
  });
  await page.getByRole('button', { name: /Bloc de données/ }).click();
  await page.getByRole('menuitem', { name: /Classement/ }).click();
  await page.getByLabel('Type').selectOption('plus-demandes');
  await page.getByLabel('Limite').fill('5');
  await page.getByLabel('Min. de candidatures').fill('0');
  await page.getByRole('button', { name: 'Insérer' }).click();
  await expect(body).toHaveValue(
    /::: classement type=plus-demandes limite=5 min_candidatures=0 :::/,
  );

  // « Relecture »: the token as a pill with its value, the block as a card.
  await page.getByRole('tab', { name: 'Relecture' }).click();
  const annotated = page.getByTestId('article-annotated');
  await expect(annotated.locator('.g-tok[title="{{ville.parcours}}"]').first()).toBeVisible();
  await expect(annotated.locator('.g-blockcard')).toContainText('Classement · les plus demandés');
  // « Aperçu »: the public rendering with the real data.
  await page.getByRole('tab', { name: 'Aperçu' }).click();
  const preview = page.getByTestId('article-preview');
  await expect(preview.locator('table.g-tbl')).toBeVisible();
  await expect(preview).toContainText('Source : Mon Master, session');
  await expect(preview.locator('details.g-faq')).toHaveCount(1);

  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(page.getByText('Guide publié.')).toBeVisible();
  const [row] = await sql<{ status: string; online: boolean }>(
    'SELECT status, online FROM "Article" WHERE slug = $1',
    [slug],
  );
  expect(row).toEqual({ status: 'PUBLISHED', online: true });
  const audit = await sql<{ action: string }>(
    `SELECT a.action FROM "AuditLog" a JOIN "Article" x ON x.id = a."targetId" WHERE x.slug = $1`,
    [slug],
  );
  expect(audit.map((a) => a.action)).toEqual(
    expect.arrayContaining(['a créé le guide', 'a publié le guide']),
  );

  const res = await page.request.get(`/guides/${slug}`);
  expect(res.status()).toBe(200);

  // A new slug: the former address answers 301.
  await page.goto(
    `/admin/articles/${(await sql<{ id: string }>('SELECT id FROM "Article" WHERE slug = $1', [slug]))[0]!.id}`,
  );
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Modifier' }).click();
  await page.getByLabel('Adresse du guide').fill(`${slug}-v2`);
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByText('L’ancienne adresse redirigera ici (301).')).toBeVisible();
  await page.getByRole('button', { name: 'Mettre à jour' }).click();
  await expect(page.getByText('Version en ligne mise à jour.')).toBeVisible();
  const moved = await page.request.get(`/guides/${slug}`, { maxRedirects: 0 });
  expect(moved.status()).toBe(301);
  expect(moved.headers().location).toMatch(new RegExp(`/guides/${slug}-v2$`));
});

test('public page: table, table of contents, FAQ, city card, « À lire aussi », SEO', async ({
  page,
}) => {
  await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
  await page.goto(GUIDE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Masters à Strasbourg : le guide de test',
  );
  await expect(page).toHaveTitle('Masters à Strasbourg : le guide de test');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/guides\/e2e-guide-strasbourg$/,
  );
  // Breadcrumb Accueil / Masters à Strasbourg / Guides, the label of the city and theme.
  const crumbs = page.getByRole('navigation', { name: 'Fil d’Ariane' });
  await expect(crumbs).toContainText('Masters à Strasbourg');
  await expect(page.getByText('Strasbourg · Sélectivité', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Chiffres Mon Master \d{4}, mis à jour automatiquement/),
  ).toBeVisible();
  // The figures: no token nor block left.
  const html = await page.content();
  expect(html).not.toMatch(/\{\{|:::/);
  await expect(page.locator('.g-prose table.g-tbl')).toBeVisible();
  await expect(page.locator('.g-prose figcaption')).toContainText('Taux d’accès = propositions');
  // Table of contents of the H2.
  const toc = page.getByRole('navigation', { name: 'Sommaire' });
  await expect(toc.getByRole('link')).toHaveText([
    'Les masters les plus demandés',
    'Bien lire un taux d’accès',
    'Questions fréquentes',
  ]);
  // FAQ: native <details>.
  const faq = page.locator('details.g-faq');
  await expect(faq).toHaveCount(2);
  await faq.first().locator('summary').click();
  await expect(faq.first()).toHaveAttribute('open', '');
  // City card and « À lire aussi ».
  await expect(page.getByRole('link', { name: /Voir les \d+ masters/ }).last()).toHaveAttribute(
    'href',
    '/masters/strasbourg',
  );
  await expect(page.getByRole('navigation', { name: 'À lire aussi' })).toContainText(
    'Guide de pagination 25',
  );
  // JSON-LD Article, never a rating.
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const article = ld.find((t) => t.includes('"Article"'));
  expect(article).toBeTruthy();
  expect(article).not.toMatch(/Rating|review/i);
  // The « Guides » tab of the navigation is the current one.
  await expect(
    page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: 'Guides' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('a guide is on the page of its city and on /guides; a draft answers 404', async ({ page }) => {
  await page.goto('/masters/strasbourg');
  const section = page.getByRole('region', { name: 'Guides sur les masters à Strasbourg' });
  await expect(
    section.getByRole('link', { name: /Masters à Strasbourg : le guide de test/ }),
  ).toBeVisible();

  await page.goto('/guides');
  await waitForHydration(page);
  await expect(
    page.getByRole('link', { name: /Masters à Strasbourg : le guide de test/ }),
  ).toBeVisible();
  // Live filtering, the address follows.
  await page.getByLabel('Quoi ?').fill('unistra');
  await expect(page.getByTestId('guides-count')).toHaveText('1 guide');
  await expect(page).toHaveURL(/\/guides\?q=unistra$/);
  await page.getByLabel('Quoi ?').fill('introuvable');
  await expect(page.getByText('Aucun guide ne correspond à « introuvable ».')).toBeVisible();
  await page.getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.getByTestId('guides-count')).toHaveText(/^\d+ guides$/);

  for (const path of ['/guides/e2e-guide-brouillon', '/guides/nexiste-pas']) {
    const r = await page.request.get(path);
    expect(r.status(), path).toBe(404);
  }
  const sitemap = await (await page.request.get('/sitemaps/guides.xml')).text();
  expect(sitemap).toContain('/guides/e2e-guide-strasbourg');
  expect(sitemap).not.toContain('e2e-guide-brouillon');
});

test('/guides: 20 per page, page 2 shows the 5 last, the pagination keeps the filters', async ({
  page,
}) => {
  await page.goto('/guides?sujet=methode');
  await expect(page.getByTestId('guides-count')).toHaveText('25 guides');
  await expect(page.locator('.g-row')).toHaveCount(20);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/guides$/);
  const pagination = page.getByRole('navigation', { name: 'Pagination' });
  await expect(pagination.getByRole('link', { name: '2' }).first()).toHaveAttribute(
    'href',
    '/guides?sujet=methode&page=2',
  );
  await page.goto('/guides?sujet=methode&page=2');
  await expect(page.locator('.g-row .g-row__t')).toHaveText([
    'Guide de pagination 05',
    'Guide de pagination 04',
    'Guide de pagination 03',
    'Guide de pagination 02',
    'Guide de pagination 01',
  ]);
  // A bare page 2 is indexable, its canonical itself.
  await page.goto('/guides?page=2');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/guides\?page=2$/);
});

test('320 px: no horizontal scroll of the page, the tables scroll in their frame', async ({
  page,
}) => {
  await page.setViewportSize({ width: WIDTHS.small, height: 800 });
  for (const path of [GUIDE, '/guides', '/masters/strasbourg']) {
    await page.goto(path);
    const { over, culprits } = await horizontalOverflow(page);
    expect(over, `${path} : ${culprits.join(', ')}`).toBeLessThanOrEqual(0);
  }
  await page.goto(GUIDE);
  // The city card at the end of the text, the table of contents hidden.
  await expect(page.getByRole('navigation', { name: 'Sommaire' })).toBeHidden();
  await expect(page.getByRole('link', { name: /Voir les \d+ masters/ }).first()).toBeVisible();
  const wrap = page.locator('.g-tblwrap').first();
  expect(await wrap.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
});
