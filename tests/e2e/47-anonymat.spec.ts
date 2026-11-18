/**
 * Anonymity of the public pages: the HTML and the React Server Components payload (inline in the
 * HTML, and fetched by client navigations) of the fiche, reviews and questions never carry an
 * address, a student id, an IP, a token, nor the exact time of a review or a question.
 */
import { expect, test } from '@playwright/test';
import { sql } from './helpers';

const FORBIDDEN_KEYS = [
  'email',
  'emailEnc',
  'emailHash',
  'authorEmailHash',
  'contactEmailEnc',
  'askerEmailEnc',
  'authorId',
  'studentId',
  'authorStudentId',
  'askerStudentId',
  'userId',
  'responderId',
  'ip',
  'token',
  'tokenHash',
  'codeHash',
  'documentPath',
  'reporterKey',
  'viewerKey',
  'voterKey',
];
const keyRe = new RegExp(`\\\\?"(${FORBIDDEN_KEYS.join('|')})\\\\?"\\s*:`, 'g');

async function pageAndPayload(request: import('@playwright/test').APIRequestContext, path: string) {
  const html = await (await request.get(path)).text();
  // A client navigation: Next.js answers the React Server Components payload (after a redirect
  // that sets the cache key `_rsc`, followed by the request context).
  const res = await request.get(path, { headers: { RSC: '1' } });
  expect(res.headers()['content-type'], `${path} : charge RSC`).toContain('text/x-component');
  const rsc = await res.text();
  expect(rsc.length, `${path} : charge RSC non vide`).toBeGreaterThan(1000);
  return `${html}\n${rsc}`;
}

test.describe('anonymat des pages publiques', () => {
  test('fiche, avis et questions : aucune donnée qui identifie', async ({ request }) => {
    const [withReviews] = await sql<{ slug: string; id: string }>(
      `SELECT p.slug, p.id FROM "Review" r JOIN "Program" p ON p.id = r."programId"
        WHERE r.status = 'PUBLISHED' AND p."isPublished" AND p."inOpenZone"
        GROUP BY p.id ORDER BY count(*) DESC LIMIT 1`,
    );
    const [withQuestions] = await sql<{ slug: string; id: string }>(
      `SELECT p.slug, p.id FROM "Question" q JOIN "Program" p ON p.id = q."programId"
        WHERE q.status = 'PUBLISHED' AND p."isPublished" AND p."inOpenZone"
        GROUP BY p.id ORDER BY count(*) DESC LIMIT 1`,
    );
    expect(withReviews, 'la base de démo a des avis publiés').toBeTruthy();
    const pages = [
      `/parcours/${withReviews!.slug}`,
      `/parcours/${withReviews!.slug}?tri=recents`,
      ...(withQuestions ? [`/parcours/${withQuestions.slug}?onglet=questions`] : []),
    ];
    const studentIds = (await sql<{ id: string }>(`SELECT id FROM "Student"`)).map((s) => s.id);
    const exactDates = (
      await sql<{ at: Date }>(
        `SELECT "publishedAt" AS at FROM "Review" WHERE "programId" = $1 AND "publishedAt" IS NOT NULL
         UNION SELECT "publishedAt" FROM "Question" WHERE "programId" = $2 AND "publishedAt" IS NOT NULL`,
        [withReviews!.id, withQuestions?.id ?? withReviews!.id],
      )
    )
      .map((r) => new Date(r.at).toISOString())
      .filter((iso) => !iso.endsWith('-01T00:00:00.000Z'));

    for (const path of pages) {
      const body = await pageAndPayload(request, path);
      expect(body.length, path).toBeGreaterThan(1000);
      expect(
        [...body.matchAll(keyRe)].map((m) => m[1]),
        `${path} : clés interdites`,
      ).toEqual([]);
      expect(body, `${path} : adresse de démo`).not.toMatch(/@demo\.notetonmaster\.local/);
      expect(body, `${path} : ip`).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b(?!\.)/);
      for (const id of studentIds)
        expect(body.includes(id), `${path} : identifiant d’étudiant·e`).toBe(false);
      for (const iso of exactDates)
        expect(body.includes(iso), `${path} : date exacte ${iso}`).toBe(false);
      expect(body, `${path} : attribut data- avec identifiant`).not.toMatch(
        /data-(student|author|user)[-a-z]*=/i,
      );
    }
  });
});
