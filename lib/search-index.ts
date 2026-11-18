import { prisma } from '@/lib/db';
import { rebuildProgramSearchIndex } from '@/lib/catalog/program-index';
import { fillMailDomains, refreshUniversitySectors } from '@/lib/data/sectors';
import { renameHomonymSlugs } from '@/lib/data/slugs';

/**
 * Rebuilds what the public lists read after a catalogue change (fiche edit, publication,
 * conflict resolved, sync run): the search_document view (search migration), the
 * ProgramSearchIndex table (Explorer, facets, ranking) and, after a sync, the public / private
 * sector of the establishments. No 'server-only' guard: the worker calls it
 * too. Cache tags are expired by the caller (lib/cache).
 */
export async function refreshSearchIndex(opts: { sectors?: boolean } = {}): Promise<void> {
  if (opts.sectors) {
    await refreshUniversitySectors();
    await fillMailDomains();
  }
  // Through a SECURITY DEFINER function: the application role does not own the view.
  await prisma.$executeRaw`SELECT nm_refresh_search_document()`;
  await rebuildProgramSearchIndex();
  // After a sync: homonyms told apart by city or establishment, not by a number.
  if (opts.sectors) await renameHomonymSlugs();
}
