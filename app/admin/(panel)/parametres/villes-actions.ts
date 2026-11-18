'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { guard, guardSensitive } from '@/lib/auth/admin';
import { expireTags } from '@/lib/cache/next';
import { TAGS } from '@/lib/cache/tags';
import { prisma } from '@/lib/db';
import { addZone, applyZoneStates, coveredPrograms } from '@/lib/launch/admin';
import { epciByCode, epciCommunes, searchEpcis } from '@/lib/launch/geo';

/**
 * Paramètres › Villes ouvertes. Admin role only (`team.manage`), checked in every action: the
 * screen is hidden from the other roles, but an action can be called directly.
 */

const statesSchema = z
  .array(z.object({ slug: z.string().min(1).max(80), open: z.boolean() }))
  .max(100);

/** Opens or closes the zones; one audit entry per zone that changed, with the before and after. */
export async function saveZones(raw: unknown) {
  return guardSensitive('team.manage', async (admin) => {
    const p = statesSchema.safeParse(raw);
    if (!p.success) return { ok: false as const, error: 'Données invalides.' };
    const r = await applyZoneStates(p.data, admin.id);
    for (const c of r.changes)
      await audit(
        admin,
        'SETTINGS',
        `Villes ouvertes · ${c.name}`,
        `Avant : ${c.before ? 'ouverte' : 'fermée'} · Après : ${c.after ? 'ouverte' : 'fermée'}${c.after ? '' : ' (avis gardés, masqués)'}`,
        {
          category: 'VILLES',
          action: c.after ? 'a ouvert la ville' : 'a fermé la ville',
          target: { type: 'ZONE', id: null },
          diff: [
            {
              field: 'Ville',
              before: c.before ? 'Ouverte' : 'Fermée',
              after: c.after ? 'Ouverte' : 'Fermée',
            },
          ],
        },
      );
    if (r.changes.length) {
      // lists, fiches, search, footer, open cities; the sitemap is regenerated on its next request
      expireTags([TAGS.catalog, TAGS.footer, TAGS.zones]);
      revalidatePath('/sitemap.xml');
      revalidatePath('/', 'layout');
    }
    revalidatePath('/admin/parametres');
    return {
      ok: true as const,
      message: r.changes.length
        ? `Enregistré : ${r.changes.map((c) => `${c.name} ${c.after ? 'ouverte' : 'fermée'}`).join(', ')}.`
        : 'Rien à enregistrer.',
    };
  });
}

/** « Ajouter une ville »: intercommunalities of the API, with the parcours each would publish. */
export async function findEpcis(q: unknown) {
  return guard('team.manage', async () => {
    if (typeof q !== 'string' || q.trim().length < 2) return { ok: true as const, items: [] };
    let found: Awaited<ReturnType<typeof searchEpcis>>;
    try {
      found = await searchEpcis(q, 6);
    } catch {
      return {
        ok: false as const,
        error: 'L’API Découpage administratif ne répond pas. Réessaie.',
      };
    }
    const known = new Set(
      (await prisma.launchZone.findMany({ select: { epciCode: true } })).map((z) => z.epciCode),
    );
    const items = await Promise.all(
      found
        .filter((e) => !known.has(e.code))
        .map(async (e) => {
          const codes = await epciCommunes(e.code).catch(() => []);
          return {
            code: e.code,
            name: e.nom,
            communes: codes.length,
            programs: await coveredPrograms(codes),
          };
        }),
    );
    return { ok: true as const, items };
  });
}

/** Adds a city, closed: the team checks its fiches (Fiches › « Hors ville ouverte »), then opens it. */
export async function addLaunchZone(raw: unknown) {
  return guardSensitive('team.manage', async (admin) => {
    const p = z
      .object({ code: z.string().regex(/^\d{9}$/), name: z.string().trim().min(2).max(60) })
      .safeParse(raw);
    if (!p.success)
      return { ok: false as const, error: 'Choisis une intercommunalité et un nom de ville.' };
    const epci = await epciByCode(p.data.code);
    if (!epci) return { ok: false as const, error: 'Intercommunalité inconnue de l’API.' };
    if (await prisma.launchZone.findUnique({ where: { epciCode: epci.code } }))
      return { ok: false as const, error: 'Cette intercommunalité est déjà dans la liste.' };
    const zone = await addZone(epci, p.data.name, admin.id);
    await audit(
      admin,
      'SETTINGS',
      `Villes ouvertes · ${zone.name}`,
      `Ajoutée, fermée : ${epci.nom} (${zone.communeCodes.length} communes)`,
      { category: 'VILLES', action: 'a ajouté la ville', target: { type: 'ZONE', id: zone.id } },
    );
    revalidatePath('/admin/parametres');
    return { ok: true as const, message: `${zone.name} ajoutée, fermée.` };
  });
}
