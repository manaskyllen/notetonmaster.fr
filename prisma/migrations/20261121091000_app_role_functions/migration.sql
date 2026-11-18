-- The application role (nm_app, lib/db/roles.ts) does not own the search view: it refreshes it
-- through this function, run with the rights of its owner.
CREATE OR REPLACE FUNCTION nm_refresh_search_document() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY search_document;
END;
$$;
REVOKE ALL ON FUNCTION nm_refresh_search_document() FROM PUBLIC;
