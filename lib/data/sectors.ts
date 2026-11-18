import { prisma } from '@/lib/db';
import { establishmentsReference } from '@/lib/connectors/esr-etablissements';
import { normCode } from '@/lib/data/normalize';
import { upsertAlert } from '@/lib/data/pipeline';

/**
 * Sector (public / private) and type of every university, from the annuaire des établissements
 * (latest raw file of esr-etablissements). Run after each publication of a sync. A sector set by
 * an admin (`sectorSource = "admin"`) is never overwritten. Establishments missing from the
 * annuaire get a null sector (private by default, lib/domain/sector.ts) and one alert lists them.
 */
/**
 * Usage names the annuaire gets wrong (its `uo_lib` reads « Lyon-I université »): the name the
 * establishment uses itself. Applied like an annuaire value (never over a locked name).
 */
const USAGE_NAMES: Record<string, string> = {
  '0691774D': 'Université Claude Bernard Lyon 1',
};

export async function refreshUniversitySectors(log?: (m: string) => Promise<unknown>) {
  const ref = await establishmentsReference();
  if (!ref.found) return { updated: 0, unknown: 0, skipped: true };
  const [unis, ids] = await Promise.all([
    prisma.university.findMany({
      select: {
        id: true,
        name: true,
        origin: true,
        uai: true,
        sector: true,
        sectorSource: true,
        establishmentType: true,
      },
    }),
    prisma.identifier.findMany({
      where: { entityType: 'UNIVERSITY', kind: 'UAI' },
      select: { entityId: true, value: true },
    }),
  ]);
  const lockedNames = new Set(
    (
      await prisma.fieldProvenance.findMany({
        where: { entityType: 'UNIVERSITY', field: 'universityName', locked: true },
        select: { entityId: true },
      })
    ).map((p) => p.entityId),
  );
  const uaisOf = new Map<string, string[]>();
  for (const i of ids)
    (uaisOf.get(i.entityId) ?? uaisOf.set(i.entityId, []).get(i.entityId)!).push(i.value);

  let updated = 0;
  const unknown: string[] = [];
  for (const u of unis) {
    if (u.sectorSource === 'admin') continue;
    const uais = [...(u.uai ?? '').split(/[;,]/), ...(uaisOf.get(u.id) ?? [])]
      .map((x) => normCode(x))
      .filter(Boolean);
    const etab = uais.map((x) => ref.byUai.get(x)).find(Boolean);
    const sector = etab?.sector ?? null;
    // Usage name of the annuaire on fiches created by a sync (never on a hand-made or locked one).
    const usage = etab ? (USAGE_NAMES[etab.uai] ?? etab.name) : null;
    if (usage && u.origin === 'SYNC' && usage !== u.name && !lockedNames.has(u.id)) {
      await prisma.university.update({
        where: { id: u.id },
        data: { name: usage, shortName: etab?.shortName ?? undefined },
      });
      updated++;
    }
    const type = etab?.type || null;
    if (!etab) unknown.push(u.name);
    if (
      sector !== u.sector ||
      type !== u.establishmentType ||
      (etab ? 'annuaire' : null) !== u.sectorSource
    ) {
      await prisma.university.update({
        where: { id: u.id },
        data: { sector, establishmentType: type, sectorSource: etab ? 'annuaire' : null },
      });
      updated++;
    }
  }
  if (unknown.length)
    await upsertAlert('esr-etablissements', {
      key: 'sector-unknown',
      code: 'sector-unknown',
      severity: 'WARNING',
      title: `${unknown.length} établissement${unknown.length > 1 ? 's' : ''} absent${unknown.length > 1 ? 's' : ''} de l’annuaire : masqué${unknown.length > 1 ? 's' : ''} comme privé${unknown.length > 1 ? 's' : ''}`,
      detail: `Secteur à vérifier dans Fiches (colonne « Secteur ») : ${unknown.sort().join(', ')}.`,
      link: '/admin/fiches?type=universite&secteur=inconnu',
      linkLabel: 'Vérifier les secteurs',
      count: unknown.length,
    });
  else
    await prisma.dataAlert.updateMany({
      where: { key: 'sector-unknown', resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  if (log && updated)
    await log(
      `secteur public / privé : ${updated} établissement(s) mis à jour, ${unknown.length} hors annuaire`,
    );
  return { updated, unknown: unknown.length, skipped: false };
}

/**
 * Droit de réponse: an establishment without official staff domains gets the host of its
 * website (annuaire) and its non-student university domains. Never overwrites the admin's list.
 */
export async function fillMailDomains(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "University" u SET "mailDomains" = ARRAY(
      SELECT DISTINCT d FROM (
        SELECT lower(substring(u.website from '^(?:https?://)?(?:www\\.)?([^/:?#]+)')) AS d
        UNION ALL
        SELECT lower(x) FROM unnest(u."emailDomains") AS x
      ) t
      WHERE d IS NOT NULL AND d <> '' AND d !~ '^(etu|etud|etudiant|etudiants|student|students)\\.'
      ORDER BY d)
    WHERE cardinality(coalesce(u."mailDomains", '{}')) = 0`;
}
