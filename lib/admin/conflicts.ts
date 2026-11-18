import 'server-only';
import { audit } from '@/lib/audit';
import { expireTags } from '@/lib/cache/next';
import { TAGS } from '@/lib/cache/tags';
import { prisma } from '@/lib/db';
import type { DataConflict } from '@/lib/db/generated/client';
import { forgetSourceRules } from '@/lib/data/merge';
import { refreshSearchIndex } from '@/lib/search-index';
import { conflictGroupItems, parseGroupKey } from './conflict-groups';
import { refreshIssues } from './refresh-issues';
import { sourceFamily, sourceFamilyLabel, sourceFamilyPhrase } from './source-family';

type Actor = { id: string; name: string };
type Option = {
  id: string;
  label: string;
  value: unknown;
  source: string;
  sourceKey?: string | null;
};

/**
 * Writes the chosen value of a value conflict: the column of the program (capacity, component),
 * the provenance (state OK), the conflict resolved. `lock`: an arbitration of one fiche locks the
 * field (the sync no longer touches it); a source rule does not, the next syncs follow the rule.
 * Returns whether the search index must be rebuilt.
 */
export async function applyConflictOption(
  c: DataConflict,
  option: Option,
  actor: Actor,
  o: { lock: boolean },
): Promise<boolean> {
  let reindex = false;
  if (c.entityType === 'PROGRAM') {
    const program = await prisma.program.findUnique({
      where: { id: c.entityId },
      include: { admissionStats: { orderBy: { session: 'desc' } } },
    });
    if (program && c.field === 'capacity' && typeof option.value === 'number') {
      const stat =
        program.admissionStats.find((s) => s.monMasterEntryId) ?? program.admissionStats[0];
      if (stat)
        await prisma.admissionStat.update({
          where: { id: stat.id },
          data: { capacity: option.value },
        });
    }
    if (program && c.field === 'component' && typeof option.value === 'string') {
      const comp = await prisma.component.upsert({
        where: { universityId_name: { universityId: program.universityId, name: option.value } },
        create: { universityId: program.universityId, name: option.value },
        update: {},
      });
      await prisma.program.update({ where: { id: program.id }, data: { componentId: comp.id } });
      reindex = true;
    }
  }
  const label = c.title.split(' · ')[0] ?? c.field;
  const family = sourceFamily(option);
  const prov = {
    value: option.value as never,
    source: o.lock ? `Arbitré : ${option.source}` : option.source,
    sourceKey: o.lock ? 'manual' : family.startsWith('autre:') ? null : family,
    state: 'OK' as const,
    locked: o.lock,
    lockedById: o.lock ? actor.id : null,
    lockedAt: o.lock ? new Date() : null,
  };
  await prisma.fieldProvenance.upsert({
    where: {
      entityType_entityId_field: { entityType: c.entityType, entityId: c.entityId, field: c.field },
    },
    create: { entityType: c.entityType, entityId: c.entityId, field: c.field, label, ...prov },
    update: prov,
  });
  await prisma.dataConflict.update({
    where: { id: c.id },
    data: { resolvedOption: option.id, resolvedById: actor.id, resolvedAt: new Date() },
  });
  await prisma.dataAlert.updateMany({
    where: { key: { startsWith: c.key }, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: actor.id },
  });
  return reindex;
}

/**
 * « Toujours : le site de l'université »: creates (or replaces) the SourceRule of a group
 * (establishment + field) and settles every open conflict of the group with that source. The next
 * syncs apply the rule (lib/data/merge.ts). One audit entry for the group.
 */
export async function applySourceRule(groupKey: string, sourceKey: string, actor: Actor) {
  const g = parseGroupKey(groupKey);
  if (!g || (sourceKey !== g.a && sourceKey !== g.b))
    return { ok: false as const, error: 'Groupe inconnu.' };
  const items = await conflictGroupItems(groupKey);
  if (!items.length) return { ok: false as const, error: 'Ces conflits sont déjà réglés.' };
  const label = sourceFamilyLabel(sourceKey);
  await prisma.sourceRule.upsert({
    where: { universityId_field: { universityId: g.universityId, field: g.field } },
    create: {
      universityId: g.universityId,
      field: g.field,
      sourceKey,
      sourceLabel: label,
      createdById: actor.id,
    },
    update: { sourceKey, sourceLabel: label, createdById: actor.id, createdAt: new Date() },
  });
  forgetSourceRules();
  const conflicts = await prisma.dataConflict.findMany({
    where: { id: { in: items.map((i) => i.conflictId) } },
  });
  let reindex = false;
  const changes: { fiche: string; before: string; after: string }[] = [];
  for (const c of conflicts) {
    const options = c.options as Option[];
    const option = options.find((o) => sourceFamily(o) === sourceKey);
    const other = options.find((o) => o !== option);
    if (!option) continue;
    reindex = (await applyConflictOption(c, option, actor, { lock: false })) || reindex;
    changes.push({
      fiche: items.find((i) => i.conflictId === c.id)!.title,
      before: other?.label ?? '—',
      after: option.label,
    });
  }
  if (reindex) {
    await refreshSearchIndex();
    expireTags([TAGS.footer, TAGS.catalog]);
  }
  await refreshIssues({ programIds: items.map((i) => i.programId) }, actor.id);
  const uni = await prisma.university.findUnique({
    where: { id: g.universityId },
    select: { name: true },
  });
  const fieldLabel = conflicts[0]?.title.split(' · ')[0] ?? g.field;
  await audit(
    actor,
    'DATA',
    `${fieldLabel} · ${uni?.name ?? g.universityId}`,
    `Règle de source créée : toujours ${sourceFamilyPhrase(sourceKey)} (${changes.length} fiche${changes.length > 1 ? 's' : ''} réglée${changes.length > 1 ? 's' : ''})`,
    {
      action: 'a arbitré un conflit, en règle, sur',
      target: { type: 'UNIVERSITY', id: g.universityId },
      diff: [
        {
          field: fieldLabel,
          before: [...new Set(changes.map((c) => c.before))].join(' / '),
          after: [...new Set(changes.map((c) => c.after))].join(' / '),
        },
        {
          field: 'Règle',
          before: '—',
          after: `Toujours ${sourceFamilyPhrase(sourceKey)} · appliquée à ${changes.length} fiche${changes.length > 1 ? 's' : ''} de ${uni?.name ?? 'l’établissement'}`,
        },
      ],
    },
  );
  return {
    ok: true as const,
    count: changes.length,
    rule: `toujours ${sourceFamilyPhrase(sourceKey)}`,
  };
}
