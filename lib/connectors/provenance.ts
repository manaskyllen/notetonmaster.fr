import { prisma } from '@/lib/db';
import type { EntityType, FieldState } from '@/lib/db/generated/enums';
import { decideFieldUpdate } from '@/lib/domain/provenance';
import type { RunContext, RunStats } from './types';

export interface Incoming {
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
  field: string;
  label: string;
  value: unknown;
  source: string;
  sourceKey: string;
  state?: FieldState;
}

/**
 * Applies one field coming from a connector:
 * - locked fields and fields with an open conflict are left untouched;
 * - a disagreement with another source opens a DataConflict instead of overwriting.
 */
export async function syncField(inc: Incoming, ctx: RunContext, stats: RunStats) {
  const current = await prisma.fieldProvenance.findUnique({
    where: {
      entityType_entityId_field: {
        entityType: inc.entityType,
        entityId: inc.entityId,
        field: inc.field,
      },
    },
  });
  const openConflict = await prisma.dataConflict.findFirst({
    where: { entityId: inc.entityId, field: inc.field, resolvedAt: null },
    select: { id: true },
  });
  if (openConflict && !current?.locked) {
    stats.unchanged++;
    return;
  }
  const decision = decideFieldUpdate(
    current
      ? {
          field: current.field,
          value: current.value,
          source: current.source,
          state: current.state,
          locked: current.locked,
        }
      : undefined,
    { field: inc.field, value: inc.value, source: inc.source, state: inc.state },
  );
  switch (decision.action) {
    case 'skip-locked':
      stats.skippedLocked++;
      await ctx.log(
        'SKIP',
        `${inc.entityLabel} · ${inc.label} : champ verrouillé, valeur manuelle conservée`,
      );
      return;
    case 'unchanged':
      stats.unchanged++;
      await prisma.fieldProvenance.update({
        where: { id: current!.id },
        data: { fetchedAt: new Date() },
      });
      return;
    case 'conflict': {
      stats.conflicts++;
      await prisma.dataConflict.upsert({
        where: { key: `${inc.entityId}:${inc.field}` },
        create: {
          key: `${inc.entityId}:${inc.field}`,
          entityType: inc.entityType,
          entityId: inc.entityId,
          field: inc.field,
          title: `${inc.label} · ${inc.entityLabel}`,
          detail: `${current!.source} et ${inc.source} ne donnent pas la même valeur.`,
          options: [
            {
              id: 'current',
              label: String(current!.value),
              value: current!.value,
              source: current!.source,
              sourceKey: current!.sourceKey,
            },
            {
              id: 'incoming',
              label: String(inc.value),
              value: inc.value,
              source: inc.source,
              sourceKey: inc.sourceKey,
            },
          ] as never,
        },
        update: {},
      });
      await prisma.fieldProvenance.update({
        where: { id: current!.id },
        data: { state: 'CONFLICT' },
      });
      await ctx.log(
        'WARN',
        `${inc.entityLabel} · ${inc.label} : conflit entre ${current!.source} et ${inc.source}`,
      );
      return;
    }
    default: {
      const d = decision;
      if (d.action === 'create') stats.created++;
      else stats.updated++;
      await prisma.fieldProvenance.upsert({
        where: {
          entityType_entityId_field: {
            entityType: inc.entityType,
            entityId: inc.entityId,
            field: inc.field,
          },
        },
        create: {
          entityType: inc.entityType,
          entityId: inc.entityId,
          field: inc.field,
          label: inc.label,
          value: inc.value as never,
          source: inc.source,
          sourceKey: inc.sourceKey,
          state: d.next.state,
          fetchedAt: new Date(),
        },
        update: {
          value: inc.value as never,
          source: inc.source,
          sourceKey: inc.sourceKey,
          state: d.next.state,
          fetchedAt: new Date(),
        },
      });
    }
  }
}

/** Opens (or reopens) a data-quality alert. */
export async function ensureAlert(a: {
  key: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  title: string;
  detail: string;
  link?: string;
  linkLabel?: string;
}) {
  await prisma.dataAlert.upsert({ where: { key: a.key }, create: a, update: {} });
}
