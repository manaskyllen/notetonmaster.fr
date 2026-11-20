-- Domain of the mentions created by the Mon Master import before November 2026. The importer did
-- not recognise the disciplines « S.H.S. » nor « M.E.E.F. » / « MEEF »: those mentions had no
-- domain, and the home counted 0 mention in « Sciences humaines et sociales ». Each mention
-- without a domain gets the one most of its parcours point to (same rule as
-- lib/domain/discipline-domain.ts, run again after each sync by lib/data/mention-domains.ts).
-- A domain already set is never changed.
WITH votes AS (
  SELECT p."mentionId" AS id, mode() WITHIN GROUP (ORDER BY v.slug) AS slug
    FROM "Program" p
    JOIN LATERAL (
      SELECT CASE
               WHEN s.raw->>'disci_master' ~* '^(droit|econ)' THEN 'droit-economie-gestion'
               WHEN s.raw->>'disci_master' ~* '^(s\.?\s*h\.?\s*s|m\.?\s*e\.?\s*e\.?\s*f)|humaines|sociales' THEN 'sciences-humaines-et-sociales'
               WHEN s.raw->>'disci_master' ~* '^lettres' THEN 'arts-lettres-langues'
               WHEN s.raw->>'disci_master' ~* '^sc(\.|iences)' THEN 'sciences-technologies-sante'
             END AS slug
        FROM "AdmissionStat" s WHERE s."programId" = p.id
    ) v ON v.slug IS NOT NULL
   GROUP BY p."mentionId"
)
UPDATE "Mention" m SET "domainId" = d.id
  FROM votes JOIN "Domain" d ON d.slug = votes.slug
 WHERE m.id = votes.id AND m."domainId" IS NULL;
