import 'server-only';
import { prisma } from '@/lib/db';
import { cursusView } from '@/lib/catalog/cursus-view';

/** One number of a parcours in the admin (issue #21). */
export interface AdminCursus {
  code: string;
  /** Number of the latest session (a cursus), or an older number (history). */
  live: boolean;
  label: string | null;
  /** Label typed by hand (wins over the rules), « Mène vers : » typed by hand. */
  manualLabel: string | null;
  leadsTo: string | null;
  places: number | null;
  /** The fiche it came from, when it joined this parcours (« Séparer » brings it back there). */
  home: { id: string; slug: string; title: string } | null;
}

export interface AdminCursusData {
  programId: string;
  /** This fiche was merged into a parcours: its cursus are shown there. */
  mergedInto: { id: string; title: string; slug: string } | null;
  kind: string;
  cursus: AdminCursus[];
}

export async function getAdminCursus(programId: string): Promise<AdminCursusData | null> {
  const p = await prisma.program.findUnique({
    where: { id: programId },
    select: {
      id: true,
      status: true,
      mergedInto: { select: { id: true, title: true, slug: true } },
      university: { select: { uai: true } },
      monMasterEntries: {
        select: { id: true, code: true, cursusLabel: true, lastSession: true, homeProgramId: true },
      },
      admissionStats: {
        select: {
          monMasterEntryId: true,
          session: true,
          capacity: true,
          applications: true,
          offers: true,
        },
      },
    },
  });
  if (!p) return null;
  const codes = p.monMasterEntries.map((e) => e.code);
  const [overrides, homes] = await Promise.all([
    prisma.cursusOverride.findMany({ where: { code: { in: codes } } }),
    prisma.program.findMany({
      where: {
        id: {
          in: p.monMasterEntries
            .map((e) => e.homeProgramId)
            .filter((h): h is string => !!h && h !== p.id),
        },
      },
      select: { id: true, slug: true, title: true },
    }),
  ]);
  const over = new Map(overrides.map((o) => [o.code, o]));
  const homeOf = new Map(homes.map((h) => [h.id, h]));
  const view = cursusView(
    p.monMasterEntries,
    p.admissionStats,
    new Map(overrides.filter((o) => o.leadsTo).map((o) => [o.code, o.leadsTo!])),
    null,
  );
  const placesOf = new Map(view.items.map((i) => [i.code, i.places]));
  const latest = Math.max(0, ...p.monMasterEntries.map((e) => e.lastSession ?? 0));
  return {
    programId: p.id,
    mergedInto: p.status === 'MERGED' ? p.mergedInto : null,
    kind: view.kind,
    cursus: p.monMasterEntries
      .map((e) => ({
        code: e.code,
        live: (e.lastSession ?? 0) === latest,
        label: e.cursusLabel,
        manualLabel: over.get(e.code)?.label ?? null,
        leadsTo: over.get(e.code)?.leadsTo ?? null,
        places: placesOf.get(e.code) ?? null,
        home: e.homeProgramId ? (homeOf.get(e.homeProgramId) ?? null) : null,
      }))
      .sort(
        (a, b) =>
          Number(b.live) - Number(a.live) ||
          (b.places ?? -1) - (a.places ?? -1) ||
          a.code.localeCompare(b.code),
      ),
  };
}
