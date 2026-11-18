import { expect, test } from '@playwright/test';
import { sql, waitForHydration } from './helpers';

/** Fiche parcours, part A: the reviews first (summary in the hero, tabs right after it). */
const VNP = 'valorisation-des-nouveaux-patrimoines';

test('the hero summarises every published review and leads to the Avis tab', async ({ page }) => {
  const [r] = await sql<{ n: string; v: string; pos: string }>(
    `SELECT count(*) n, count(*) FILTER (WHERE "isVerified") v, count(*) FILTER (WHERE "overallRating" >= 4) pos
       FROM "Review" r JOIN "Program" p ON p.id = r."programId" WHERE p.slug = $1 AND r.status = 'PUBLISHED'`,
    [VNP],
  );
  const n = Number(r!.n);
  const share = Math.round((Number(r!.pos) / n) * 100);
  // filtered list (M2 only): the summary still counts every review
  await page.goto(`/parcours/${VNP}?niveau=M2`);
  await waitForHydration(page);
  const hero = page.locator('section').filter({ has: page.getByRole('heading', { level: 1 }) });
  const summary = hero.getByRole('button', { name: new RegExp(`${n} avis d’étudiant·es`) });
  await expect(summary).toContainText(`${share} % le recommandent · Lire les avis ↓`);
  await expect(summary.getByRole('img', { name: /^Note globale : [\d,]+ sur 5$/ })).toBeVisible();

  // the tabs come right after the hero: no admission figures in between
  const tabs = page.getByRole('tablist', { name: 'Sections de la fiche' });
  const between = await page.evaluate(() => {
    const h = document.querySelector('h1')!.closest('section')!;
    const t = document.querySelector('[role=tablist]')!;
    const all = [...document.querySelectorAll('section[aria-label="Chiffres d’admission"]')];
    return all.filter(
      (s) =>
        h.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING &&
        s.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).length;
  });
  expect(between).toBe(0);
  await expect(tabs.getByRole('tab', { name: 'Avis' })).toHaveAttribute('aria-selected', 'true');

  // a click on the summary: « Tous » again, Avis tab, scrolled
  await page.getByRole('tab', { name: 'Programme' }).click();
  await summary.click();
  await expect(page).toHaveURL(new RegExp(`/parcours/${VNP}#avis$`));
  await expect(tabs.getByRole('tab', { name: 'Avis' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#avis')).toBeInViewport();
});

test('Admission tab: « D’où viennent les admis ? » first, no figure cards, no « Candidature » card', async ({
  page,
}) => {
  await page.goto(`/parcours/${VNP}?onglet=admission`);
  await waitForHydration(page);
  const panel = page.getByRole('tabpanel', { name: 'Admission' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Chiffres d’admission' })).toHaveCount(0);
  await expect(
    panel.getByText(
      /^(Places en M1|Propositions d’admission|Frais d’inscription|Plateforme Mon Master)$/,
    ),
  ).toHaveCount(0);
  const headings = await panel.getByRole('heading', { level: 2 }).allTextContents();
  expect(headings[0]).toBe('D’où viennent les admis ?');
  expect(headings.indexOf('Comment ce master évolue')).toBeGreaterThan(0);
  // no « plan B » block on the site yet: no link to it
  await expect(panel.getByRole('link', { name: /alternatives plus accessibles/ })).toHaveCount(0);
});

test('without review: « Pas encore d’avis · Tu as suivi ce master ? Donne le premier avis »', async ({
  page,
}) => {
  const [p] = await sql<{ slug: string }>(
    `SELECT p.slug FROM "Program" p JOIN "University" u ON u.id = p."universityId"
      WHERE p."isPublished" AND p."inOpenZone" AND u.sector = 'PUBLIC'
        AND NOT EXISTS (SELECT 1 FROM "Review" r WHERE r."programId" = p.id AND r.status = 'PUBLISHED')
      ORDER BY p.slug LIMIT 1`,
  );
  await page.goto(`/parcours/${p!.slug}`);
  await expect(
    page.getByRole('link', {
      name: 'Pas encore d’avis Tu as suivi ce master ? Donne le premier avis',
    }),
  ).toHaveAttribute('href', `/avis/nouveau?parcours=${p!.slug}`);
});
