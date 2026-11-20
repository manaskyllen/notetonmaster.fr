import { Prisma } from '../db/generated/client';
import { prisma } from '../db';
import { refreshIndexRatings } from './index-ratings';
import { refreshProgramRatings } from './program-ratings';
import { centre, resolveCommune } from '../data/geo';
import { communeIndex, forgetCommuneIndex } from '../data/commune-index';
import { refreshProgramAvailability } from '../launch/zones';
import { normCity } from '../data/normalize';
import { disciplineDomainSql } from '../domain/discipline-domain';

/**
 * ProgramSearchIndex: one row per listed program, rebuilt after each publication and
 * refreshed program by program after each review change. No 'server-only' guard: the worker
 * rebuilds it at the end of a sync.
 *
 * Rows are computed by one INSERT … SELECT (the rules below), then a second pass resolves the
 * communes the campus table does not know (« Rennes Cédex », « Evry ») against the INSEE list,
 * and flags the parcours taught abroad (Phnom Penh, Hô Chi Minh-Ville…).
 */

/**
 * Mon Master `disci_master` → the four domains of the site (MEEF goes with the humanities), the
 * mention's domain when the discipline is unknown. Rule shared with the importer:
 * lib/domain/discipline-domain.ts.
 */
const DOMAIN_SQL = `coalesce(${disciplineDomainSql('agg.disci')}, d.slug)`;

export const SELECT_SQL = `
WITH listed AS (
  SELECT p.* FROM "Program" p
    JOIN "University" u ON u.id = p."universityId"
    JOIN "Mention" m ON m.id = p."mentionId"
   WHERE p."isPublished" AND p."inOpenZone" AND p.status IN ('ACTIVE', 'NOT_RENEWED')
     AND u."isPublished" AND m."isPublished"
     AND ($1::text[] IS NULL OR p.id = ANY($1::text[]))
),
lat AS (
  -- Latest session of the headline figures: Mon Master entries first (lib/queries/catalog.ts).
  SELECT DISTINCT ON (s."programId") s."programId", s.session, (s."monMasterEntryId" IS NOT NULL) AS mm
    FROM "AdmissionStat" s JOIN listed l ON l.id = s."programId"
   WHERE s."monMasterEntryId" IS NOT NULL OR s.capacity IS NOT NULL OR s.applications IS NOT NULL
   ORDER BY s."programId", (s."monMasterEntryId" IS NOT NULL) DESC, s.session DESC
),
agg AS (
  SELECT l."programId", l.session,
         CASE WHEN bool_or(s.capacity IS NOT NULL) THEN sum(s.capacity) END AS places,
         CASE WHEN bool_or(s.applications IS NOT NULL) THEN sum(s.applications) END AS apps,
         CASE WHEN bool_or(s.offers IS NOT NULL) THEN sum(s.offers) END AS offers,
         string_agg(coalesce(s.raw->>'modalite_enseignement', ''), ',') AS modes,
         bool_or(s.raw->>'alternance' = '1') AS alt,
         max(s.raw->>'secteur_disci_lib') AS discipline,
         max(s.raw->>'disci_master') AS disci,
         max(s.raw->>'lieux') AS lieux
    FROM lat l
    JOIN "AdmissionStat" s ON s."programId" = l."programId" AND s.session = l.session
                          AND (s."monMasterEntryId" IS NOT NULL) = l.mm
   GROUP BY 1, 2
),
acc AS (
  SELECT DISTINCT ON (s."programId") s."programId", s."accessRate"
    FROM "AdmissionStat" s JOIN listed l ON l.id = s."programId"
   WHERE s."accessRate" IS NOT NULL
   ORDER BY s."programId", s.session DESC
),
base AS (
  SELECT p.id, p.slug, p.title AS source_title, p."shortName", p.status, p."entryLevel", p."durationYears",
         p.modality, p.keywords, p.city AS raw_city, p.campus,
         u.id AS uid, u.slug AS uslug, u.name AS uname, u."shortName" AS ushort, u.uai,
         u."parentId" AS uparent, u.sector, u."establishmentType" AS etype,
         m.id AS mid, m.slug AS mslug, m.name AS mname, cert.title AS cert_title,
         c.name AS component, ca.name AS campus_name,
         ci."inseeCode", ci.name AS city_name, ci."departmentCode", ci.department, ci.region,
         coalesce(ca.lat, ci.lat) AS lat, coalesce(ca.lng, ci.lng) AS lng,
         ${DOMAIN_SQL} AS domain_slug,
         agg.discipline, agg.places, agg.apps, agg.offers, agg.modes, agg.alt, agg.lieux, agg.session,
         acc."accessRate" AS brochure_rate,
         p."reviewCount" AS n, p."verifiedReviewCount" AS nv, p."avgRating" AS avg, p."recommendShare" AS reco,
         ARRAY(SELECT z.slug FROM "LaunchZone" z WHERE z.open AND z."communeCodes" && p."siteCommunes"
                ORDER BY z."order") AS zone_slugs,
         substring(p.title FROM '^(.+?) : M2 .+$') AS parent_title,
         coalesce(substring(p.title FROM '^.+? : M2 (.+)$'), p.title) AS title
    FROM listed p
    JOIN "University" u ON u.id = p."universityId"
    JOIN "Mention" m ON m.id = p."mentionId"
    LEFT JOIN "Domain" d ON d.id = m."domainId"
    LEFT JOIN "Certification" cert ON cert.id = m."certificationId"
    LEFT JOIN "Component" c ON c.id = p."componentId"
    LEFT JOIN "Campus" ca ON ca.id = p."campusId"
    LEFT JOIN LATERAL (
      SELECT c2.* FROM "City" c2
       WHERE c2.id = ca."cityId" OR (ca."cityId" IS NULL AND c2.name = p.city)
       ORDER BY (c2.id = ca."cityId") DESC NULLS LAST, c2.slug
       LIMIT 1
    ) ci ON true
    LEFT JOIN agg ON agg."programId" = p.id
    LEFT JOIN acc ON acc."programId" = p.id
),
calc AS (
  SELECT b.*,
         CASE WHEN b.apps > 0 AND b.offers IS NOT NULL THEN least(100, b.offers::float / b.apps * 100)
              ELSE b.brochure_rate END AS access_rate,
         array_remove(ARRAY[
           CASE WHEN coalesce(b.modes, '') ~ 'INITIALE'
                  OR (coalesce(b.modes, '') !~ '[A-Z]' AND b.modality IN ('ONSITE', 'HYBRID')) THEN 'presentiel' END,
           CASE WHEN coalesce(b.modes, '') ~ 'APPRENTISSAGE|CONTRAT_PRO' OR b.alt OR b.modality = 'WORK_STUDY' THEN 'alternance' END,
           CASE WHEN coalesce(b.modes, '') ~ 'CONTINUE' THEN 'continue' END,
           CASE WHEN coalesce(b.modes, '') ~ 'HYBRIDE|DISTANCE' OR b.modality IN ('HYBRID', 'REMOTE') THEN 'distance' END
         ], NULL) AS modalities,
         CASE WHEN b.sector = 'PUBLIC' THEN
                CASE WHEN b.etype = 'Université' OR b.uname ~* '^universit|universit[ée]$' THEN 'UNIVERSITY' ELSE 'PUBLIC_SCHOOL' END
              ELSE 'PRIVATE' END AS kind,
         CASE WHEN length(b.uname) <= 42 OR b.ushort IS NULL THEN b.uname ELSE b.ushort END AS ushort_display,
         coalesce(b.city_name, b.raw_city) AS city_display
    FROM base b
)
SELECT id AS "programId", slug, title, parent_title AS "parentTitle", source_title AS "sourceTitle",
       "shortName", status, uid AS "universityId", uslug AS "universitySlug",
       coalesce(nullif(split_part(coalesce(uai, ''), ';', 1), ''), uslug) AS "universityKey",
       uname AS "universityName", ushort_display AS "universityShort", uparent AS "universityParentId",
       kind, coalesce(sector = 'PUBLIC', false) AS "isPublicSector",
       mid AS "mentionId", mslug AS "mentionSlug", mname AS "mentionName",
       domain_slug AS "domainSlug", discipline,
       nullif(regexp_replace(public.nm_norm(coalesce(discipline, '')), '[^a-z0-9]+', '-', 'g'), '') AS "disciplineSlug",
       component AS "componentName", coalesce(campus_name, campus) AS "campusName",
       CASE WHEN "inseeCode" IS NOT NULL THEN 'insee:' || "inseeCode"
            ELSE 'nom:' || regexp_replace(public.nm_norm(city_display), '[^a-z0-9]+', '-', 'g') END AS "cityKey",
       city_display AS "cityName", "inseeCode" AS "cityInsee", "departmentCode", department AS "departmentName",
       region, nullif(regexp_replace(public.nm_norm(coalesce(region, '')), '[^a-z0-9]+', '-', 'g'), '') AS "regionSlug",
       lat, lng, false AS "isAbroad", zone_slugs AS "zoneSlugs",
       modalities, "durationYears",
       (CASE WHEN parent_title IS NOT NULL THEN 'M2' ELSE "entryLevel"::text END)::"EntryLevel" AS "entryLevel",
       places::int, apps::int AS applications, offers::int, access_rate AS "accessRate",
       CASE WHEN access_rate IS NULL THEN 'nc' WHEN access_rate < 10 THEN 'tres-selectif'
            WHEN access_rate <= 30 THEN 'selectif' ELSE 'accessible' END AS "accessBand",
       session AS "lastSession",
       coalesce(n, 0)::int AS "reviewCount", coalesce(nv, 0)::int AS "verifiedReviewCount", avg::float AS "avgRating", reco AS "recommendShare",
       setweight(to_tsvector('french', public.nm_unaccent(coalesce(title, '') || ' ' || coalesce("shortName", ''))), 'A')
         || setweight(to_tsvector('french', public.nm_unaccent(coalesce(mname, '') || ' ' || uname || ' ' || coalesce(ushort, ''))), 'B')
         || setweight(to_tsvector('french', public.nm_unaccent(concat_ws(' ', city_display, department, region, component, campus_name,
                      CASE WHEN 'alternance' = ANY(modalities) THEN 'alternance apprentissage' END,
                      CASE WHEN parent_title IS NOT NULL OR "entryLevel" = 'M2' THEN 'm2' END))), 'C')
         || setweight(to_tsvector('french', public.nm_unaccent(concat_ws(' ', array_to_string(keywords, ' '), cert_title,
                      CASE WHEN parent_title IS NOT NULL THEN source_title END))), 'D') AS tsv,
       public.nm_norm(title) AS "titleNorm",
       public.nm_norm(concat_ws(' ', source_title, "shortName", mname, uname, ushort, city_display, component, campus_name)) AS "textNorm",
       now() AS "updatedAt"
  FROM calc`;

const COLUMNS = `"programId", slug, title, "parentTitle", "sourceTitle", "shortName", status, "universityId",
  "universitySlug", "universityKey", "universityName", "universityShort", "universityParentId", kind,
  "isPublicSector", "mentionId", "mentionSlug", "mentionName", "domainSlug", discipline, "disciplineSlug",
  "componentName", "campusName", "cityKey", "cityName", "cityInsee", "departmentCode", "departmentName",
  region, "regionSlug", lat, lng, "isAbroad", "zoneSlugs", modalities, "durationYears", "entryLevel", places, applications, offers, "accessRate",
  "accessBand", "lastSession", "reviewCount", "verifiedReviewCount", "avgRating", "recommendShare", tsv, "titleNorm",
  "textNorm", "updatedAt"`;

/** Countries and cities abroad seen in Mon Master `lieux` (Phnom Penh, Hô Chi Minh-Ville…). */
const ABROAD =
  /\b(cambodge|vietnam|viet nam|maroc|tunisie|algerie|liban|senegal|cote d.ivoire|egypte|chine|japon|coree|inde|bresil|argentine|mexique|canada|quebec|etats.unis|royaume.uni|irlande|allemagne|espagne|italie|portugal|belgique|suisse|luxembourg|grece|roumanie|bulgarie|pologne|hongrie|russie|ukraine|turquie|armenie|georgie|emirats|qatar|madagascar|maurice|cameroun|gabon|mali|burkina|niger|benin|togo|djibouti|phnom penh|ho chi minh|hanoi|beyrouth|casablanca|rabat|tunis|dakar|shanghai|pekin|abou dhabi|dubai|erevan|tbilissi|bucarest|sofia|le caire|alexandrie)\b/;

/**
 * Place names of Mon Master that are not communes (an agglomeration, a former commune, a
 * misspelling): INSEE code of the commune where the campus is.
 */
const COMMUNE_ALIASES: Record<string, string> = {
  'marne la vallee': '77083', // Champs-sur-Marne (Cité Descartes)
  'cergy pontoise': '95127', // Cergy
  'futuroscope chasseneuil': '86062', // Chasseneuil-du-Poitou
  'seyssinnet pariset': '38485', // Seyssinet-Pariset
  'annecy le vieux': '74010', // Annecy
  abymes: '97101', // Les Abymes
  montfavet: '84007', // Avignon
  evry: '91228', // Évry-Courcouronnes
  'pointe a pitre': '97120',
  schoelcher: '97229',
};

function plain(s: string) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Second pass: communes the campus table does not know. « Rennes Cédex », « Saint-Denis Cédex 9 »
 * resolve to their INSEE commune (official name, department, region, centre); places abroad are
 * flagged and grouped under « À l'étranger ».
 */
async function resolvePlaces(ids: string[] | null) {
  const rows = await prisma.programSearchIndex.findMany({
    where: { cityInsee: null, ...(ids ? { programId: { in: ids } } : {}) },
    select: { programId: true, cityName: true, universityId: true },
  });
  if (!rows.length) return;
  const raw = new Map(
    (
      await prisma.admissionStat.findMany({
        where: { programId: { in: rows.map((r) => r.programId) }, raw: { not: Prisma.DbNull } },
        select: { programId: true, raw: true },
        orderBy: { session: 'desc' },
      })
    ).map((s) => [s.programId, String((s.raw as Record<string, unknown> | null)?.lieux ?? '')]),
  );
  const unis = new Map(
    (
      await prisma.university.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.universityId))] } },
        select: { id: true, campuses: { select: { city: { select: { departmentCode: true } } } } },
      })
    ).map((u) => [
      u.id,
      [...new Set(u.campuses.map((c) => c.city.departmentCode).filter(Boolean))],
    ]),
  );
  const idx = await communeIndex();
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const r of rows) {
    const text = plain(`${r.cityName} ${raw.get(r.programId) ?? ''}`);
    if (ABROAD.test(text)) {
      // Keep the source spelling unless it is all capitals (« PHNOM PENH » → « Phnom Penh »).
      const name =
        r.cityName === r.cityName.toUpperCase()
          ? r.cityName
              .toLowerCase()
              .replace(/(^|[\s'’(-])(\p{L})/gu, (_, a, b: string) => a + b.toUpperCase())
          : r.cityName.replace(/\((\p{Ll})/gu, (_, c: string) => `(${c.toUpperCase()}`);
      updates.push(
        prisma.programSearchIndex.update({
          where: { programId: r.programId },
          data: {
            isAbroad: true,
            cityName: name,
            cityKey: `etranger:${normCity(name).replace(/[^a-z0-9]+/g, '-')}`,
          },
        }),
      );
      continue;
    }
    if (!idx) continue;
    const alias = COMMUNE_ALIASES[normCity(r.cityName).replace(/-/g, ' ')];
    const name = r.cityName
      .replace(/\s+c[ée]dex(\s+\d+)?$/i, '')
      .replace(/^(st|ste)[\s-]/i, (m) => (m.toLowerCase().startsWith('ste') ? 'Sainte-' : 'Saint-'))
      .trim();
    let hit = alias ? (idx.byCode.get(alias) ?? null) : null;
    for (const dep of hit ? [] : [...(unis.get(r.universityId) ?? []), null]) {
      hit = resolveCommune(idx, name, dep as string | null);
      if (hit) break;
    }
    if (!hit) continue;
    const c = centre(hit);
    updates.push(
      prisma.programSearchIndex.update({
        where: { programId: r.programId },
        data: {
          cityInsee: hit.code,
          cityKey: `insee:${hit.code}`,
          cityName: hit.nom,
          departmentCode: hit.codeDepartement,
          departmentName: hit.departement?.nom ?? null,
          region: hit.region?.nom ?? null,
          regionSlug: hit.region?.nom ? normCity(hit.region.nom).replace(/[^a-z0-9]+/g, '-') : null,
          lat: c?.lat ?? null,
          lng: c?.lng ?? null,
        },
      }),
    );
  }
  for (let i = 0; i < updates.length; i += 200)
    await prisma.$transaction(updates.slice(i, i + 200));
}

/** Rebuilds every row (≈ 8 000 programs: one statement, then the commune pass). */
export async function rebuildProgramSearchIndex(): Promise<number> {
  // The title rule of the index also sets the entry level of the program itself.
  await prisma.$executeRaw`
    UPDATE "Program" SET "entryLevel" = 'M2'
     WHERE title ~ ${'^.+? : M2 .+$'} AND "entryLevel" <> 'M2'`;
  // Ratings of every program from the reviews (they are otherwise refreshed review by review).
  await refreshProgramRatings(null);
  // Sites of every program, then « published » = isPublished && in an open launch zone.
  forgetCommuneIndex();
  await refreshProgramAvailability(null);
  const n = await prisma.$transaction(
    async (tx) => {
      // raw-sql: constant column list and SELECT; ids, when any, are $n parameters.
      await tx.$executeRawUnsafe(`DELETE FROM "ProgramSearchIndex"`);
      // raw-sql: constant column list and SELECT; ids, when any, are $n parameters.
      return tx.$executeRawUnsafe(
        `INSERT INTO "ProgramSearchIndex" (${COLUMNS}) ${SELECT_SQL}`,
        null,
      );
    },
    { timeout: 120_000 },
  );
  forgetCommuneIndex();
  await resolvePlaces(null);
  await refreshIndexRatings();
  return n;
}

/** Recomputes the rows of these programs (a review published or removed, a fiche edited). */
export async function refreshProgramIndexRows(ids: string[]): Promise<void> {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return;
  // A fiche may have moved (campus, Mon Master places): its sites and its zone first.
  await refreshProgramAvailability(list);
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "ProgramSearchIndex" WHERE "programId" = ANY(${list})`,
    // raw-sql: constant column list and SELECT; ids, when any, are $n parameters.
    prisma.$executeRawUnsafe(`INSERT INTO "ProgramSearchIndex" (${COLUMNS}) ${SELECT_SQL}`, list),
  ]);
  await resolvePlaces(list);
  // The mentions and universities of these rows: their ratings follow (indexes).
  await refreshIndexRatings();
}
