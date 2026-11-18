import { sql } from '../e2e/helpers';

/**
 * Example conflicts for the screenshots (the dev data has almost none): 7 « Composante »
 * conflicts between the university site and Mon Master on parcours of one establishment, plus 3
 * « Places en M1 » ones on another. Values are examples; removed by `dropDemoConflicts`.
 */
export const DEMO = 'visual-demo:';

export async function createDemoConflicts() {
  await dropDemoConflicts();
  const [vnp] = await sql<{ id: string; universityId: string }>(
    `SELECT id, "universityId" FROM "Program" WHERE slug = 'valorisation-des-nouveaux-patrimoines'`,
  );
  const groups: {
    uni: string;
    field: string;
    label: string;
    n: number;
    a: [string, string];
    b: [string, string];
  }[] = [
    {
      uni: vnp!.universityId,
      field: 'component',
      label: 'Composante',
      n: 7,
      a: [
        'UFR Histoire, histoire de l’art et archéologie',
        'Site de l’université · page de la formation',
      ],
      b: ['Faculté des langues et cultures étrangères', 'Mon Master · données ouvertes 2025'],
    },
  ];
  const [other] = await sql<{ universityId: string }>(
    `SELECT p."universityId" FROM "Program" p JOIN "ProgramSearchIndex" i ON i."programId" = p.id
      WHERE p."universityId" <> $1 GROUP BY 1 HAVING count(*) >= 3 ORDER BY count(*) DESC LIMIT 1`,
    [vnp!.universityId],
  );
  groups.push({
    uni: other!.universityId,
    field: 'capacity',
    label: 'Places en M1',
    n: 3,
    a: ['22', 'Mon Master · données ouvertes 2025'],
    b: ['24', 'Site de l’université · page de la formation'],
  });
  for (const g of groups) {
    const progs = await sql<{ id: string; title: string }>(
      `SELECT p.id, p.title FROM "Program" p JOIN "ProgramSearchIndex" i ON i."programId" = p.id
        WHERE p."universityId" = $1 ORDER BY (p.id = $2) DESC, p.title LIMIT $3`,
      [g.uni, vnp!.id, g.n],
    );
    for (const p of progs) {
      const options = [
        {
          id: 'current',
          label: g.b[0],
          value: g.field === 'capacity' ? Number(g.b[0]) : g.b[0],
          source: g.b[1],
          sourceKey: 'monmaster-opendata',
        },
        {
          id: 'incoming',
          label: g.a[0],
          value: g.field === 'capacity' ? Number(g.a[0]) : g.a[0],
          source: g.a[1],
          sourceKey: 'univ-sites',
        },
      ];
      if (g.field === 'capacity') options.reverse();
      await sql(
        `INSERT INTO "DataConflict" (id, key, kind, "entityType", "entityId", field, title, detail, options, "createdAt")
         VALUES (gen_random_uuid()::text, $1, 'VALUE', 'PROGRAM', $2, $3, $4, 'exemple', $5::jsonb, now() - interval '14 days')`,
        [
          `${DEMO}${g.field}:${p.id}`,
          p.id,
          g.field,
          `${g.label} · ${p.title}`,
          JSON.stringify(options),
        ],
      );
    }
  }
  return vnp!.id;
}

export async function dropDemoConflicts() {
  await sql(`DELETE FROM "DataConflict" WHERE key LIKE $1`, [`${DEMO}%`]);
}
