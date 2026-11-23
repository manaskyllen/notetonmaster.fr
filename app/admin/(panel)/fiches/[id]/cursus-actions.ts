'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { guard, type Admin } from '@/lib/auth/admin';
import { expireTags } from '@/lib/cache/next';
import { TAGS } from '@/lib/cache/tags';
import {
  attachFiche,
  setCursusLabel,
  splitCursus,
  type CursusActionResult,
} from '@/lib/catalog/cursus';
import { refreshProgramIndexRows } from '@/lib/catalog/program-index';
import { refreshProgramRatings } from '@/lib/catalog/program-ratings';
import { currentProgramSlug } from '@/lib/data/slugs';
import { prisma } from '@/lib/db';

/**
 * Cursus of a parcours in the admin (issue #21): rename a cursus, split it, attach a fiche. Each
 * action is confirmed in the browser, written to the audit log, and kept by the next sync
 * (CursusOverride).
 */

type Result = { ok: true; message: string } | { ok: false; error: string };

/** Index rows, ratings, search view and caches of the fiches an action touched. */
async function refreshAfter(r: CursusActionResult) {
  const ids = [...new Set(r.touched)];
  await refreshProgramRatings(ids);
  await refreshProgramIndexRows(ids);
  await prisma.$executeRaw`SELECT nm_refresh_search_document()`;
  expireTags([TAGS.catalog, TAGS.footer, ...ids.map((id) => TAGS.program(id))]);
  for (const id of ids) revalidatePath(`/admin/fiches/${id}`);
  revalidatePath('/admin/fiches');
}

const titleOf = async (id: string) =>
  (await prisma.program.findUnique({ where: { id }, select: { title: true } }))?.title ?? id;

async function log(admin: Admin, programId: string, action: string, detail: string) {
  await audit(admin, 'DATA', await titleOf(programId), detail, {
    action,
    target: { type: 'PROGRAM', id: programId },
  });
}

const labelSchema = z.object({
  programId: z.string().min(1),
  code: z.string().min(4).max(20),
  label: z.string().trim().max(60),
  leadsTo: z.string().trim().max(300),
});

/** Label and « Mène vers : » of a cursus, typed by hand (empty label: back to the rules). */
export async function renameCursusAction(input: z.infer<typeof labelSchema>): Promise<Result> {
  return guard('data.edit', async (admin) => {
    const d = labelSchema.parse(input);
    const r = await setCursusLabel(d.code, d.label || null, d.leadsTo || null, admin.id);
    if (!r.ok) return { ok: false as const, error: r.error ?? 'Action impossible.' };
    await log(
      admin,
      d.programId,
      'a renommé un cursus',
      `Cursus ${d.code} : libellé « ${d.label || 'calculé par les règles'} »${d.leadsTo ? `, mène vers « ${d.leadsTo} »` : ''}.`,
    );
    await refreshAfter(r);
    return {
      ok: true as const,
      message: 'Libellé enregistré : il sera gardé aux prochaines synchronisations.',
    };
  });
}

/** « Séparer »: the cursus becomes a parcours of its own again, with its former URL. */
export async function splitCursusAction(input: {
  programId: string;
  code: string;
}): Promise<Result> {
  return guard('data.edit', async (admin) => {
    const r = await splitCursus(input.code, admin.id);
    if (!r.ok) return { ok: false as const, error: r.error ?? 'Action impossible.' };
    const home = r.touched.find((t) => t !== input.programId);
    await log(
      admin,
      input.programId,
      'a séparé un cursus',
      `Cursus ${input.code} séparé : il redevient une fiche à part.`,
    );
    if (home)
      await log(
        admin,
        home,
        'a séparé un cursus',
        `Fiche séparée du parcours « ${await titleOf(input.programId)} ».`,
      );
    await refreshAfter(r);
    return {
      ok: true as const,
      message: 'Cursus séparé : sa fiche et son adresse sont rétablies.',
    };
  });
}

/** The fiche named by a URL, a slug, a Mon Master number or an id. */
async function findFiche(input: string): Promise<string | null> {
  const raw = input.trim();
  const slug = /\/parcours\/([^/?#\s]+)/.exec(raw)?.[1] ?? raw;
  const current = await currentProgramSlug(decodeURIComponent(slug).toLowerCase());
  if (current)
    return (
      (await prisma.program.findUnique({ where: { slug: current }, select: { id: true } }))?.id ??
      null
    );
  const entry = await prisma.monMasterEntry.findUnique({
    where: { code: raw.toUpperCase().replace(/\s+/g, '') },
    select: { programId: true },
  });
  if (entry) return entry.programId;
  return (
    (await prisma.program.findUnique({ where: { id: raw }, select: { id: true } }))?.id ?? null
  );
}

/** « Rattacher »: another fiche joins this parcours; its URL answers 301 to it. */
export async function attachFicheAction(input: {
  programId: string;
  fiche: string;
}): Promise<Result> {
  return guard('data.edit', async (admin) => {
    const fromId = await findFiche(input.fiche);
    if (!fromId)
      return {
        ok: false as const,
        error: 'Fiche introuvable (adresse, n° Mon Master ou identifiant).',
      };
    const fromTitle = await titleOf(fromId);
    const r = await attachFiche(fromId, input.programId, admin.id);
    if (!r.ok) return { ok: false as const, error: r.error ?? 'Action impossible.' };
    await log(
      admin,
      input.programId,
      'a rattaché une fiche',
      `Fiche « ${fromTitle} » rattachée comme cursus.`,
    );
    await log(
      admin,
      fromId,
      'a rattaché une fiche',
      `Rattachée au parcours « ${await titleOf(input.programId)} ».`,
    );
    await refreshAfter(r);
    return {
      ok: true as const,
      message: `« ${fromTitle} » est maintenant un cursus de ce parcours.`,
    };
  });
}
