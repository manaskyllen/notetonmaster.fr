-- Consistency of a restored database (scripts/restore.sh), after the rebuild: one line per
-- broken rule, nothing when the database is consistent.
SELECT 'migration en échec : ' || migration_name FROM _prisma_migrations
 WHERE finished_at IS NULL AND rolled_back_at IS NULL
UNION ALL
SELECT 'nm_app ne peut pas lire les avis'
 WHERE NOT has_table_privilege('nm_app', '"Review"', 'SELECT')
UNION ALL
SELECT 'nm_app ne peut pas écrire les avis'
 WHERE NOT has_table_privilege('nm_app', '"Review"', 'INSERT')
UNION ALL
SELECT 'avis publiés (' || (SELECT count(*) FROM "Review" WHERE status = 'PUBLISHED')
       || ') ≠ somme des compteurs des parcours (' || (SELECT coalesce(sum("reviewCount"), 0) FROM "Program") || ')'
 WHERE (SELECT count(*) FROM "Review" WHERE status = 'PUBLISHED')
       <> (SELECT coalesce(sum("reviewCount"), 0) FROM "Program")
UNION ALL
SELECT 'index de recherche (' || (SELECT count(*) FROM "ProgramSearchIndex")
       || ' lignes) ≠ parcours publiés des villes ouvertes (' || n || ')'
  FROM (SELECT count(*) AS n FROM "Program" p
          JOIN "University" u ON u.id = p."universityId"
          JOIN "Mention" m ON m.id = p."mentionId"
         WHERE p."isPublished" AND p."inOpenZone" AND p.status IN ('ACTIVE', 'NOT_RENEWED')
           AND u."isPublished" AND m."isPublished") x
 WHERE n <> (SELECT count(*) FROM "ProgramSearchIndex")
UNION ALL
SELECT 'parcours dans une ville ouverte alors qu''aucune ne l''est'
 WHERE NOT EXISTS (SELECT 1 FROM "LaunchZone" WHERE open)
   AND EXISTS (SELECT 1 FROM "Program" WHERE "inOpenZone")
UNION ALL
SELECT 'vue de recherche vide alors que l''index ne l''est pas'
 WHERE EXISTS (SELECT 1 FROM "ProgramSearchIndex")
   AND NOT EXISTS (SELECT 1 FROM search_document);
