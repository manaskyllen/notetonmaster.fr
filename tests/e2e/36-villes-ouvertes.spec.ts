import { expect, test } from '@playwright/test';
import { expireZonesCache, loginAdmin, sql, waitForHydration } from './helpers';

/** Launch limited to Strasbourg, Mulhouse and Nantes. */
const VNP = 'valorisation-des-nouveaux-patrimoines'; // Nantes
const EMAS = 'evenementiel-mediation-des-arts-et-des-sciences'; // Versailles
const NOT_YET =
  'On ouvre les villes petit à petit, pour avoir assez d’avis dans chacune avant de la mettre en ligne. La tienne arrive bientôt.';

/**
 * Masters published in each open city, as the home counts and orders them (getOpenZones): the
 * most furnished first, ties in the order of the zones.
 */
async function zoneCounts() {
  return sql<{ slug: string; name: string; n: number }>(
    `SELECT z.slug, z.name, count(DISTINCT i."programId")::int n
       FROM "LaunchZone" z
       JOIN "Program" p ON p."siteCommunes" && z."communeCodes"
       JOIN "ProgramSearchIndex" i ON i."programId" = p.id AND i."isPublicSector"
      WHERE z.open GROUP BY z.slug, z.name, z."order"
      ORDER BY n DESC, z."order", z.name`,
  );
}

test('home, three cities: one line « Déjà ouvert à A, B et C · Voir les universités → »', async ({
  page,
}) => {
  const before = (await sql<{ slug: string }>(`SELECT slug FROM "LaunchZone" WHERE open`)).map(
    (r) => r.slug,
  );
  // three cities: the others closed for the test only (the index is left as it is)
  await sql(`UPDATE "LaunchZone" SET open = slug = ANY($1)`, [
    ['strasbourg', 'mulhouse', 'nantes'],
  ]);
  await expireZonesCache(page);
  try {
    const zones = await zoneCounts();
    expect(zones).toHaveLength(3);
    await page.goto('/');
    await waitForHydration(page);
    const line = page.getByRole('group', { name: 'Villes ouvertes' });
    await expect(line).toHaveText(
      `Déjà ouvert à ${zones[0]!.name}, ${zones[1]!.name} et ${zones[2]!.name} Voir les universités →`,
    );
    // one line: each city is a button that fills « Où ? », one link at the end
    await expect(line.getByRole('button')).toHaveCount(3);
    await expect(line.getByRole('link')).toHaveCount(1);
    await expect(line.getByRole('link')).toHaveAttribute('href', '/universites');
    await line.getByRole('button', { name: `Choisir ${zones[0]!.name}` }).click();
    await expect(page.getByRole('button', { name: /^Où \?/ })).toHaveAccessibleName(
      `Où ? ${zones[0]!.name}`,
    );
    // the city card leads to its landing page (/masters/{ville}), which counts its parcours
    await page
      .getByRole('region', { name: 'Pars de ta ville' })
      .getByRole('link', { name: new RegExp(`^Masters à ${zones[0]!.name} :`) })
      .click();
    await expect(page).toHaveURL(new RegExp(`/masters/${zones[0]!.slug}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: `Les masters à ${zones[0]!.name}` }),
    ).toBeVisible();
    await expect(
      page.getByText(
        new RegExp(`^${zones[0]!.n.toLocaleString('fr-FR').replace(/\s/g, '\\s')} parcours dans`),
      ),
    ).toBeVisible();
  } finally {
    await sql(`UPDATE "LaunchZone" SET open = slug = ANY($1)`, [before]);
    await expireZonesCache(page);
  }
});

test('home, more than three cities: three names then « et n autres », a city without master never shown and flagged in the admin', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const more = ['Lyon', 'Marseille', 'Rennes', 'Sarrebourg'];
  // Sarrebourg without any master: its communes emptied for the test
  const [{ codes }] = (await sql<{ codes: string[] }>(
    `SELECT "communeCodes" codes FROM "LaunchZone" WHERE slug = 'sarrebourg'`,
  )) as [{ codes: string[] }];
  await sql(`UPDATE "LaunchZone" SET "communeCodes" = '{}' WHERE slug = 'sarrebourg'`);
  await loginAdmin(page);
  const zones = async () => {
    await page.goto('/admin/parametres');
    await waitForHydration(page);
    await page.getByRole('tab', { name: 'Villes ouvertes' }).click();
    return page.getByRole('tabpanel', { name: 'Villes ouvertes' });
  };
  // only the cities this test opens are closed again
  const opened: string[] = [];
  try {
    let panel = await zones();
    for (const n of more) {
      const sw = panel.getByRole('switch', { name: `Ouvrir ${n}` });
      if (await sw.count()) {
        await sw.click();
        opened.push(n);
      }
    }
    if (opened.length) {
      await panel.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByText(/^Enregistré : /)).toBeVisible({ timeout: 180_000 });
    }
    panel = await zones();
    await expect(
      panel.getByText('Aucun master publié : la ville n’apparaît pas sur le site'),
    ).toHaveCount(1);

    const counted = await zoneCounts();
    expect(counted.length).toBeGreaterThan(3);
    await page.goto('/');
    await waitForHydration(page);
    const line = page.getByRole('group', { name: 'Villes ouvertes' });
    const others = counted.length - 3;
    await expect(line).toHaveText(
      `Déjà ouvert dans ${counted.length} villes : ${counted
        .slice(0, 3)
        .map((z) => z.name)
        .join(', ')} et ${others} autre${others > 1 ? 's' : ''} Voir toutes les villes →`,
    );
    await expect(line).not.toContainText('Sarrebourg');
    await expect(line.getByRole('button')).toHaveCount(3);
    // beyond three cities, the link leads to the cities
    await expect(line.getByRole('link')).toHaveAttribute('href', '/masters');
    // one line on desktop
    const box = (await line.boundingBox())!;
    expect(box.height).toBeLessThan(60);
    // « Lyon » open: a city to choose, no « pas encore »
    await page.getByRole('combobox', { name: 'Quoi ?' }).fill('Lyon');
    await expect(
      page.getByRole('group', { name: 'Villes' }).getByRole('option', { name: /Masters à Lyon/ }),
    ).toBeVisible();
    await expect(page.getByText(/n’est pas encore sur/)).toHaveCount(0);
  } finally {
    await sql(`UPDATE "LaunchZone" SET "communeCodes" = $1 WHERE slug = 'sarrebourg'`, [codes]);
    if (opened.length) {
      const p = await zones();
      for (const n of opened) {
        const sw = p.getByRole('switch', { name: `Fermer ${n}` });
        if (await sw.count()) await sw.click();
      }
      await p.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByText(/^Enregistré : /)).toBeVisible({ timeout: 180_000 });
    }
  }
});

test('« Lyon »: not on notetonmaster yet, on the home, in Explorer and in the palette', async ({
  page,
}) => {
  await page.goto('/explorer?q=Lyon');
  await expect(
    page.getByRole('heading', { name: 'Lyon n’est pas encore sur notetonmaster' }),
  ).toBeVisible();
  const card = page.getByText(NOT_YET);
  await expect(card).toBeVisible();
  // no list of cities in the card: the line under the search names them
  await expect(card.locator('..').getByRole('link')).toHaveCount(0);
  await expect(page.getByText('Rien pour l’instant…')).toHaveCount(0);
  // the home says it in its suggestions, with the open cities to choose instead
  await page.goto('/');
  await waitForHydration(page);
  await page.getByRole('combobox', { name: 'Quoi ?' }).fill('Lyon');
  await expect(page.getByText('Lyon n’est pas encore sur notetonmaster')).toBeVisible();
  await page.getByRole('button', { name: /^Masters à Strasbourg$/ }).click();
  await expect(page.getByRole('button', { name: /^Où \?/ })).toHaveAccessibleName(
    'Où ? Strasbourg',
  );
  await expect(page.getByRole('combobox', { name: 'Quoi ?' })).toHaveValue('');
  await page.goto(`/parcours/${VNP}`);
  await waitForHydration(page);
  const palette = page.getByRole('dialog', { name: 'Recherche et navigation' });
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await palette.getByRole('combobox').fill('Lyon');
  const row = palette.getByRole('option', {
    name: /Lyon.*Pas encore disponible · on ouvre les villes petit à petit/,
  });
  await expect(row).toBeVisible();
});

test('a parcours of Versailles: 404 « Pas encore sur notetonmaster », never indexed', async ({
  page,
  request,
}) => {
  const r = await request.get(`/parcours/${EMAS}`);
  expect(r.status()).toBe(404);
  expect(r.headers()['x-robots-tag']).toBe('noindex');
  await page.goto(`/parcours/${EMAS}`);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /« Événementiel, médiation des arts et des sciences » n’est pas encore sur notetonmaster/,
    }),
  ).toBeVisible();
  await expect(page.getByText(NOT_YET)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  // a mention with no parcours in an open city: the same page
  const [m] = await sql<{ slug: string }>(
    `SELECT m.slug FROM "Mention" m WHERE m."isPublished"
        AND NOT EXISTS (SELECT 1 FROM "ProgramSearchIndex" i WHERE i."mentionId" = m.id) ORDER BY m.slug LIMIT 1`,
  );
  expect((await request.get(`/mentions/${m!.slug}`)).status()).toBe(404);
  // no review on it either
  await page.goto(`/avis/nouveau?parcours=${EMAS}`);
  await expect(page.getByText('Événementiel, médiation des arts et des sciences')).toHaveCount(0);
});

test('footer: the figures of the published perimeter, named after the open cities', async ({
  page,
}) => {
  await page.goto('/explorer');
  await expect(
    page.getByText('parcours de master à Strasbourg, Mulhouse et Nantes'),
  ).toBeAttached();
});

test('admin: closing then reopening Nantes hides then brings back its parcours and reviews; two audit entries', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const reviews = async () =>
    Number(
      (
        await sql<{ n: string }>(
          `SELECT count(*) n FROM "Review" r JOIN "Program" p ON p.id = r."programId" WHERE p.slug = $1 AND r.status = 'PUBLISHED'`,
          [VNP],
        )
      )[0]!.n,
    );
  const before = await reviews();
  const indexed = async () =>
    Number(
      (
        await sql<{ n: string }>(
          `SELECT count(*) n FROM "ProgramSearchIndex" WHERE 'nantes' = ANY("zoneSlugs")`,
        )
      )[0]!.n,
    );
  const nantes = await indexed();
  expect(nantes).toBeGreaterThan(0);
  await loginAdmin(page);
  const zones = async () => {
    await page.goto('/admin/parametres');
    await waitForHydration(page);
    await page.getByRole('tab', { name: 'Villes ouvertes' }).click();
    return page.getByRole('tabpanel', { name: 'Villes ouvertes' });
  };
  try {
    let panel = await zones();
    await panel.getByRole('switch', { name: 'Fermer Nantes' }).click();
    await expect(panel.getByRole('status')).toContainText(
      /Nantes fermée : \d+ parcours seront masqués à l’enregistrement\. Les avis sont gardés\./,
    );
    await panel.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Enregistré : Nantes fermée.')).toBeVisible({ timeout: 60_000 });
    expect(await indexed()).toBe(0);
    expect((await request.get(`/parcours/${VNP}`)).status()).toBe(404);
    expect(await reviews()).toBe(before);

    panel = await zones();
    await panel.getByRole('switch', { name: 'Ouvrir Nantes' }).click();
    await panel.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Enregistré : Nantes ouverte.')).toBeVisible({ timeout: 60_000 });
  } finally {
    // never leave Nantes closed for the other tests
    await sql(`UPDATE "LaunchZone" SET open = true WHERE slug = 'nantes'`);
  }
  expect(await indexed()).toBe(nantes);
  expect((await request.get(`/parcours/${VNP}`)).status()).toBe(200);
  expect(await reviews()).toBe(before);
  await page.goto('/admin/audit');
  await expect(page.getByText('Villes ouvertes · Nantes').first()).toBeVisible();
  const [a] = await sql<{ n: string }>(
    `SELECT count(*) n FROM (SELECT detail FROM "AuditLog" WHERE "objectLabel" = 'Villes ouvertes · Nantes' ORDER BY at DESC LIMIT 2) x
      WHERE detail IN ('Avant : ouverte · Après : fermée (avis gardés, masqués)', 'Avant : fermée · Après : ouverte')`,
  );
  expect(Number(a!.n)).toBe(2);
});
