import { expect, test } from '@playwright/test';
import { loginAdmin, sql, waitForHydration } from './helpers';

/** Fiche parcours, part B: the Programme tab by year, its filters, its states and the admin. */
const VNP = 'valorisation-des-nouveaux-patrimoines';

async function programmeTab(page: import('@playwright/test').Page, slug: string) {
  await page.goto(`/parcours/${slug}`);
  await waitForHydration(page);
  await page.getByRole('tab', { name: 'Programme' }).click();
  return page.getByRole('tabpanel', { name: 'Programme' });
}

test('facts, timeline by year, dark stage semesters, old booklet', async ({ page }) => {
  const panel = await programmeTab(page, VNP);
  for (const t of [
    '2 ans · 120 ECTS',
    '2 stages',
    '3 mois minimum en M1, 3 à 6 mois en M2',
    '2 mémoires',
    '≈ 50 pages, puis ≈ 80 pages',
    'Guide-conférencier',
  ])
    await expect(panel.getByText(t, { exact: true })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Première année' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Deuxième année' })).toBeVisible();
  const s2 = panel.locator('article').filter({ hasText: 'Semestre 2' });
  await expect(s2.getByText('Stage de 3 mois minimum')).toBeVisible();
  await expect(s2.getByText('Soutenu en juin')).toBeVisible();
  // dark card: no course list
  await expect(s2.locator('ul').first().locator('li').first()).toContainText('Stage');
  // booklet 2022-2023: yellow notice and the proposal link
  await expect(panel.getByText(/Livret pédagogique 2022-2023 de l’UFR Histoire/)).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'Le programme a changé ? Signale-le' }),
  ).toHaveAttribute('href', `/a-propos?sujet=programme&parcours=${VNP}#contact`);
});

test('the theme filter highlights one theme, with only the themes present', async ({ page }) => {
  const panel = await programmeTab(page, VNP);
  const group = panel.getByRole('group', { name: 'Mettre en avant une thématique' });
  // « Patrimoine »: the short name of the mention for the core
  await expect(group.getByRole('button')).toHaveText([
    'Tout',
    'Patrimoine',
    'Méthodes et recherche',
    'Droit, gestion et économie',
    'Numérique et données',
    'Langues',
    'Projets et terrain',
  ]);
  await expect(group.getByRole('button', { name: 'Tout' })).toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: 'Langues' }).click();
  await expect(group.getByRole('button', { name: 'Langues' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const en = panel.getByRole('listitem').filter({ hasText: 'Anglais + LV2' });
  const muse = panel.getByRole('listitem').filter({ hasText: 'Muséologie' });
  await expect(en).toHaveCSS('opacity', '1');
  await expect(muse).toHaveCSS('opacity', '0.28');
});

test('a parcours of another discipline: law is its core', async ({ page }) => {
  const [p] = await sql<{ slug: string }>(
    `SELECT p.slug FROM "Program" p JOIN "Mention" m ON m.id = p."mentionId"
      WHERE m.name ILIKE 'Droit%' AND p."isPublished"
        AND EXISTS (SELECT 1 FROM "ProgramSemester" s JOIN "ProgramCourse" c ON c."semesterId" = s.id WHERE s."programId" = p.id)
      ORDER BY p.slug LIMIT 1`,
  );
  test.skip(!p, 'no law parcours with a programme in this database');
  const panel = await programmeTab(page, p!.slug);
  const group = panel.getByRole('group', { name: 'Mettre en avant une thématique' });
  await expect(group.getByRole('button', { name: 'Cœur du master' })).toBeVisible();
  await expect(group.getByRole('button', { name: 'Droit, gestion et économie' })).toHaveCount(0);
});

test('without programme: empty state with both proposals', async ({ page }) => {
  const [p] = await sql<{ slug: string }>(
    `SELECT p.slug FROM "Program" p JOIN "University" u ON u.id = p."universityId"
      WHERE p."isPublished" AND p."inOpenZone" AND u.sector = 'PUBLIC'
        AND NOT EXISTS (SELECT 1 FROM "ProgramSemester" s WHERE s."programId" = p.id)
      ORDER BY p.slug LIMIT 1`,
  );
  const panel = await programmeTab(page, p!.slug);
  await expect(
    panel.getByText('Le programme de ce parcours n’est pas encore disponible'),
  ).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Propose-le' })).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'Vous êtes responsable de ce parcours ? Complétez la fiche' }),
  ).toBeVisible();
});

test('the proposal link prefills the contact form', async ({ page }) => {
  await page.goto(`/a-propos?sujet=programme&parcours=${VNP}#contact`);
  await waitForHydration(page);
  await expect(page.getByLabel('Sujet')).toHaveValue('programme');
  await expect(page.getByLabel('Lien de la fiche concernée')).toHaveValue(
    new RegExp(`/parcours/${VNP}$`),
  );
});

test('admin: a theme picked by hand is locked and shown on the fiche', async ({ page }) => {
  const [c] = await sql<{ id: string; pid: string; slug: string; label: string; category: string }>(
    `SELECT c.id, p.id pid, p.slug, c.label, c.category::text FROM "ProgramCourse" c
       JOIN "ProgramSemester" s ON s.id = c."semesterId" JOIN "Program" p ON p.id = s."programId"
      WHERE p.slug = $1 AND c.label = 'Muséologie'`,
    [VNP],
  );
  // the save rewrites the programme as « Saisi à la main » and locks it: restored at the end
  const [prov] = await sql<{ row: unknown }>(
    `SELECT to_jsonb(f) AS row FROM "FieldProvenance" f WHERE "entityId" = $1 AND field = 'semesters'`,
    [c!.pid],
  );
  const sources = await sql<{ label: string; doc: string | null; year: string | null }>(
    `SELECT label, "sourceDocument" AS doc, "sourceYear" AS year FROM "ProgramSemester" WHERE "programId" = $1`,
    [c!.pid],
  );
  await loginAdmin(page);
  await page.goto(`/admin/fiches/${c!.pid}`);
  await waitForHydration(page);
  // One accordion per semester: Muséologie is in M2 · Semestre 3.
  await page.getByRole('button', { name: /M2 · Semestre 3/ }).click();
  const select = page.getByRole('combobox', { name: /^Thématique de Muséologie/ });
  await expect(select).toHaveValue('CORE');
  await select.selectOption('METHODS');
  await expect(select).toHaveAccessibleName(/choisie à la main/);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Enregistré · ajouté au journal d’audit')).toBeVisible();
  const [after] = await sql<{ category: string; categoryLocked: boolean }>(
    `SELECT c.category::text, c."categoryLocked" FROM "ProgramCourse" c
       JOIN "ProgramSemester" s ON s.id = c."semesterId" WHERE s."programId" = $1 AND c.label = 'Muséologie'`,
    [c!.pid],
  );
  expect(after).toEqual({ category: 'METHODS', categoryLocked: true });
  const [log] = await sql<{ detail: string }>(
    `SELECT detail FROM "AuditLog" WHERE "objectLabel" LIKE 'Fiche %' ORDER BY at DESC LIMIT 1`,
  );
  expect(log!.detail).toMatch(/^Programme saisi à la main : 4 semestres/);
  // back to the keyword category and the booklet provenance (other tests read this fiche)
  await sql(
    `UPDATE "ProgramCourse" c SET category = 'CORE', "categoryLocked" = false FROM "ProgramSemester" s
      WHERE s.id = c."semesterId" AND s."programId" = $1 AND c.label = 'Muséologie'`,
    [c!.pid],
  );
  for (const r of sources)
    await sql(
      `UPDATE "ProgramSemester" SET "sourceDocument" = $3, "sourceYear" = $4 WHERE "programId" = $1 AND label = $2`,
      [c!.pid, r.label, r.doc, r.year],
    );
  await sql(`DELETE FROM "FieldProvenance" WHERE "entityId" = $1 AND field = 'semesters'`, [
    c!.pid,
  ]);
  if (prov)
    await sql(
      `INSERT INTO "FieldProvenance" SELECT * FROM jsonb_populate_record(NULL::"FieldProvenance", $1::jsonb)`,
      [JSON.stringify(prov.row)],
    );
});
