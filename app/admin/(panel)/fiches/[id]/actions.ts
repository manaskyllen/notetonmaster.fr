'use server';

import { refreshSearchIndex } from '@/lib/search-index';
import { queueIndexNow } from '@/lib/seo/indexnow';
import { expireTags } from '@/lib/cache/next';
import { TAGS } from '@/lib/cache/tags';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit, change } from '@/lib/audit';
import { guard, type Admin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';
import type { EntityType, Modality } from '@/lib/db/generated/enums';
import { EXAM_MODES, getFicheForEdit } from '@/lib/admin/fiche-edit';
import { normText } from '@/lib/data/normalize';

/** Admission lists entered by hand (decision 11): one item per line. */
const ADMISSION_LISTS = [
  'expectations',
  'selectionCriteria',
  'examModes',
  'languages',
  'advisedDegrees',
];
const lines = (v: string) =>
  v
    .split(/\r?\n/)
    .map((x) => x.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 30);

const payloadSchema = z.object({
  values: z.record(z.string(), z.string().max(5000)),
  locks: z.record(z.string(), z.boolean()),
  published: z.boolean(),
});

/** Provenance key for an edited form field. */
const provKey = (key: string) =>
  key === 'city' ? 'campus' : key === 'rncpCode' ? 'certification' : key;

async function lockField(
  admin: Admin,
  type: EntityType,
  id: string,
  field: string,
  label: string,
  value: unknown,
  locked: boolean,
  origin: { source?: string; sourceUrl?: string | null } = {},
) {
  const source = origin.source ?? 'Saisi à la main';
  const sourceUrl = origin.sourceUrl ?? null;
  await prisma.fieldProvenance.upsert({
    where: { entityType_entityId_field: { entityType: type, entityId: id, field } },
    create: {
      entityType: type,
      entityId: id,
      field,
      label,
      value: value as never,
      source,
      sourceKey: 'manual',
      sourceUrl,
      state: 'OK',
      locked,
      lockedById: locked ? admin.id : null,
      lockedAt: locked ? new Date() : null,
    },
    update: locked
      ? {
          value: value as never,
          source,
          sourceKey: 'manual',
          sourceUrl,
          state: 'OK',
          locked: true,
          lockedById: admin.id,
          lockedAt: new Date(),
        }
      : { locked: false, lockedById: null, lockedAt: null },
  });
}

const int = (v: string) =>
  v.trim() === '' ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null;

export async function saveFiche(id: string, input: unknown) {
  return guard('data.edit', async (admin) => {
    const parsed = payloadSchema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: 'Données invalides.' };
    const before = await getFicheForEdit(id);
    if (!before) return { ok: false as const, error: 'Fiche introuvable.' };
    const { values, locks, published } = parsed.data;
    const fields = before.sections.flatMap((s) => s.fields);
    const changed = fields.filter(
      (f) => !f.readOnly && values[f.key] !== undefined && values[f.key] !== f.value,
    );
    const lockChanges = fields.filter(
      (f) => locks[f.key] !== undefined && locks[f.key] !== f.locked && !changed.includes(f),
    );
    const changedLabels: string[] = [];

    if (before.type === 'PROGRAM') {
      const program = await prisma.program.findUniqueOrThrow({
        where: { id },
        include: { admissionStats: { orderBy: { session: 'desc' } }, monMasterEntries: true },
      });
      const data: Record<string, unknown> = {};
      const urlRaw = (values.admissionSourceUrl ?? program.admissionSourceUrl ?? '').trim();
      if (urlRaw && !/^https?:\/\/[^\s]+$/.test(urlRaw))
        return {
          ok: false as const,
          error: 'L’URL de la page consultée doit commencer par http:// ou https://.',
        };
      const manual = {
        source: urlRaw ? `Saisie manuelle · ${urlRaw}` : 'Saisie manuelle',
        sourceUrl: urlRaw || null,
      };
      for (const f of changed) {
        const v = values[f.key]!;
        if (ADMISSION_LISTS.includes(f.key)) {
          let list = lines(v);
          if (f.key === 'examModes') {
            const allowed = new Map(EXAM_MODES.map((m) => [normText(m), m]));
            const bad = list.filter((x) => !allowed.has(normText(x)));
            if (bad.length)
              return {
                ok: false as const,
                error: `Modalité d’examen inconnue : ${bad.join(', ')} (${EXAM_MODES.join(', ')}).`,
              };
            list = [...new Set(list.map((x) => allowed.get(normText(x))!))];
          }
          data[f.key] = list;
          changedLabels.push(f.label.replace(/ \(.*$/, ''));
          await lockField(
            admin,
            'PROGRAM',
            id,
            f.key,
            f.label.replace(/ \(.*$/, ''),
            list,
            locks[f.key] ?? true,
            manual,
          );
          continue;
        }
        if (f.key === 'admissionSourceUrl') {
          data.admissionSourceUrl = urlRaw || null;
          changedLabels.push('Page consultée');
          await lockField(
            admin,
            'PROGRAM',
            id,
            f.key,
            'Page consultée',
            urlRaw || null,
            locks[f.key] ?? true,
            manual,
          );
          continue;
        }
        if (f.key === 'title') data.title = v.trim();
        else if (f.key === 'mention') data.mentionId = v;
        else if (f.key === 'campus') data.campus = v.trim() || null;
        else if (f.key === 'city') data.city = v.trim();
        else if (f.key === 'modality') data.modality = v as Modality;
        else if (['tuitionFees', 'selectionProcess', 'admissionCriteria'].includes(f.key))
          data[f.key] = v.trim() || null;
        else if (f.key === 'component') {
          const name = v.trim();
          data.componentId = name
            ? (
                await prisma.component.upsert({
                  where: { universityId_name: { universityId: program.universityId, name } },
                  create: { universityId: program.universityId, name },
                  update: {},
                })
              ).id
            : null;
        } else if (
          ['capacity', 'applications', 'offers', 'lastRankCalled'].includes(f.key) &&
          program.monMasterEntries.length <= 1
        ) {
          const stat = program.admissionStats[0];
          if (stat)
            await prisma.admissionStat.update({
              where: { id: stat.id },
              data: { [f.key]: int(v) },
            });
        }
        changedLabels.push(f.label);
        await lockField(admin, 'PROGRAM', id, provKey(f.key), f.label, v, locks[f.key] ?? true);
      }
      if (Object.keys(data).length) await prisma.program.update({ where: { id }, data });
      if (published !== before.isPublished) {
        await prisma.program.update({ where: { id }, data: { isPublished: published } });
        await queueIndexNow([id]);
      }
    } else if (before.type === 'MENTION') {
      const data: Record<string, unknown> = {};
      for (const f of changed) {
        data[f.key] = values[f.key]!.trim() || (f.key === 'name' ? f.value : null);
        changedLabels.push(f.label);
        await lockField(
          admin,
          'MENTION',
          id,
          provKey(f.key),
          f.label,
          values[f.key],
          locks[f.key] ?? true,
        );
      }
      await prisma.mention.update({ where: { id }, data: { ...data, isPublished: published } });
    } else {
      const data: Record<string, unknown> = {};
      for (const f of changed) {
        const v = values[f.key]!.trim();
        if (f.key === 'parentId') {
          // Decision 4: entered by hand; never itself, never a cycle (A → B → A).
          if (v === id)
            return {
              ok: false as const,
              error: 'Une université ne peut pas être son propre parent.',
            };
          for (let cur = v || null, hops = 0; cur && hops < 10; hops++) {
            const up: { parentId: string | null } | null = await prisma.university.findUnique({
              where: { id: cur },
              select: { parentId: true },
            });
            if (up?.parentId === id)
              return { ok: false as const, error: 'Ce rattachement créerait une boucle.' };
            cur = up?.parentId ?? null;
          }
          const parent = v
            ? await prisma.university.findUnique({ where: { id: v }, select: { name: true } })
            : null;
          data.parentId = v || null;
          changedLabels.push(`Établissement parent : ${parent?.name ?? 'aucun'}`);
          await lockField(
            admin,
            'UNIVERSITY',
            id,
            'parentId',
            'Établissement parent',
            parent?.name ?? null,
            locks[f.key] ?? true,
          );
          continue;
        }
        data[f.key] = ['cities', 'emailDomains', 'mailDomains'].includes(f.key)
          ? v
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)
          : v || (f.key === 'name' ? f.value : null);
        changedLabels.push(f.label);
        await lockField(admin, 'UNIVERSITY', id, provKey(f.key), f.label, v, locks[f.key] ?? true);
      }
      await prisma.university.update({ where: { id }, data: { ...data, isPublished: published } });
    }

    for (const f of lockChanges)
      await lockField(admin, before.type, id, provKey(f.key), f.label, f.value, locks[f.key]!);

    const parts = [
      changedLabels.length
        ? `Modifié à la main : ${changedLabels.join(', ')} · champ${changedLabels.length > 1 ? 's' : ''} verrouillé${changedLabels.length > 1 ? 's' : ''}`
        : null,
      lockChanges.length
        ? `${lockChanges.filter((f) => locks[f.key]).length} verrouillé(s), ${lockChanges.filter((f) => !locks[f.key]).length} déverrouillé(s)`
        : null,
      published !== before.isPublished
        ? published
          ? 'Fiche publiée'
          : 'Fiche repassée en brouillon'
        : null,
    ].filter(Boolean);
    if (parts.length)
      await audit(admin, 'DATA', before.name, parts.join(' · '), {
        action:
          published !== before.isPublished && !changedLabels.length
            ? published
              ? 'a publié'
              : 'a dépublié'
            : 'a modifié',
        target: { type: before.type, id },
        diff: [
          ...changed.map((f) => {
            const label = f.label.replace(/ \(.*$/, '');
            const opt = (v: string) => f.options?.find((o) => o.value === v)?.label ?? v;
            return change(label, opt(f.value), opt(values[f.key]!));
          }),
          ...lockChanges.map((f) =>
            change(
              `${f.label.replace(/ \(.*$/, '')} (verrou)`,
              f.locked ? 'Verrouillé' : 'Auto',
              locks[f.key] ? 'Verrouillé' : 'Auto',
            ),
          ),
          ...(published !== before.isPublished
            ? [
                change(
                  'Publication',
                  before.isPublished ? 'Publiée' : 'Brouillon',
                  published ? 'Publiée' : 'Brouillon',
                ),
              ]
            : []),
        ],
      });
    await refreshSearchIndex();
    expireTags([TAGS.footer, TAGS.catalog]);
    const { refreshIssues } = await import('@/lib/admin/refresh-issues');
    await refreshIssues(
      before.type === 'PROGRAM'
        ? { programIds: [id] }
        : before.type === 'UNIVERSITY'
          ? { universityIds: [id] }
          : { mentionIds: [id] },
      admin.id,
    );
    revalidatePath(`/admin/fiches/${id}`);
    revalidatePath('/admin/fiches');
    return {
      ok: true as const,
      message: parts.length ? 'Modifications enregistrées.' : 'Rien à enregistrer.',
    };
  });
}

const COURSE_CATEGORY = z.enum([
  'CORE',
  'METHODS',
  'LAW_ECONOMICS',
  'DIGITAL',
  'LANGUAGES',
  'PROJECTS',
]);
const programmeSchema = z.object({
  semesters: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        title: z.string().trim().max(120),
        ects: z.number().int().min(0).max(60),
        courses: z
          .array(
            z.object({
              label: z.string().trim().min(2, 'Un cours sans intitulé.').max(200),
              ects: z.number().min(0).max(60).nullable(),
              category: COURSE_CATEGORY,
              categoryLocked: z.boolean(),
            }),
          )
          .max(60),
        milestones: z
          .array(
            z.object({
              kind: z.enum(['INTERNSHIP', 'THESIS', 'PROJECT', 'STUDY_TRIP', 'CERTIFICATION']),
              title: z.string().trim().min(2, 'Un jalon sans titre.').max(120),
              detail: z.string().trim().max(160),
            }),
          )
          .max(10),
      }),
    )
    .max(8),
});

/**
 * Programme of a parcours entered or corrected by hand (Données, Admin): courses, ECTS, theme
 * (a category picked by hand is locked) and milestones. Locks the programme against the sync.
 */
export async function saveProgramme(id: string, raw: unknown) {
  return guard('data.edit', async (admin) => {
    const parsed = programmeSchema.safeParse(raw);
    if (!parsed.success)
      return {
        ok: false as const,
        error: parsed.error.issues
          .map((i) => i.message)
          .slice(0, 2)
          .join(' · '),
      };
    const program = await prisma.program.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!program) return { ok: false as const, error: 'Parcours introuvable.' };
    const { parseMilestone } = await import('@/lib/domain/program-outline');
    const semesters = parsed.data.semesters.map((s) => ({
      label: s.label,
      title: s.title || null,
      ects: s.ects,
      courses: s.courses,
      milestones: s.milestones.map((m) => {
        // figures read in the title, as for the sources (« Stage de 3 à 6 mois »)
        const read = parseMilestone(m.title, true);
        return {
          kind: m.kind,
          title: m.title,
          detail: m.detail || null,
          minMonths: read?.minMonths ?? null,
          maxMonths: read?.maxMonths ?? null,
          pages: read?.pages ?? null,
          period: read?.period ?? null,
        };
      }),
    }));
    const { writeProgramme } = await import('@/lib/catalog/program-courses');
    await writeProgramme(id, semesters, {
      document: 'Saisi à la main',
      year: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      course: 'Saisi à la main',
    });
    const courses = semesters.reduce((a, s) => a + s.courses.length, 0);
    const milestones = semesters.reduce((a, s) => a + s.milestones.length, 0);
    await lockField(
      admin,
      'PROGRAM',
      id,
      'semesters',
      'Programme',
      `${semesters.length} semestres`,
      true,
    );
    await audit(
      admin,
      'DATA',
      `Fiche ${program.title}`,
      `Programme saisi à la main : ${semesters.length} semestres, ${courses} cours, ${milestones} jalons`,
      {
        action: 'a saisi le programme de',
        target: { type: 'PROGRAM', id },
        diff: [
          change(
            'Programme',
            'Source précédente',
            `${semesters.length} semestres, ${courses} cours, ${milestones} jalons (saisi à la main)`,
          ),
        ],
      },
    );
    expireTags([TAGS.program(id)]);
    const { refreshIssues } = await import('@/lib/admin/refresh-issues');
    await refreshIssues({ programIds: [id] }, admin.id);
    revalidatePath(`/admin/fiches/${id}`);
    return { ok: true as const, message: 'Programme enregistré.' };
  });
}

/**
 * « Importer un livret (URL) »: reads the programme of a public page (robots.txt and TDMRep
 * respected, as by the collect) with the extractor of the university sites. Nothing is saved:
 * the semesters fill the editor, « Enregistrer » writes them.
 */
export async function importBooklet(id: string, rawUrl: string) {
  return guard('data.edit', async () => {
    // Never an internal address, https only unless CRAWLER_ALLOW_HTTP (lib/data/net-guard.ts).
    const { assertFetchableUrl, allowHttpFromEnv } = await import('@/lib/data/net-guard');
    let url: URL;
    try {
      url = assertFetchableUrl(String(rawUrl).trim().slice(0, 2000), {
        allowHttp: allowHttpFromEnv(),
      });
    } catch (e) {
      return {
        ok: false as const,
        error: `Adresse refusée (${(e as Error).message}) : colle l’adresse https:// publique de la page.`,
      };
    }
    if (/\.pdf($|\?)/i.test(url.pathname))
      return {
        ok: false as const,
        error:
          'Les livrets PDF ne sont pas encore lus : colle l’adresse de la page HTML de la formation, ou saisis le programme.',
      };
    const program = await prisma.program.findUnique({
      where: { id },
      select: { mention: { select: { name: true } } },
    });
    if (!program) return { ok: false as const, error: 'Parcours introuvable.' };
    const { PoliteHttpClient, crawlerUserAgent } = await import('@/lib/data/http');
    const { PrismaHostStore } = await import('@/lib/data/host-store');
    const client = new PoliteHttpClient({
      userAgent: crawlerUserAgent(),
      allowedDomains: [url.hostname],
      store: new PrismaHostStore(),
      maxRetries: 1,
      timeoutMs: 20_000,
    });
    const res = await client
      .get(url.toString(), { accept: ['html'], maxBytes: 5 * 1024 * 1024 })
      .catch((e: Error) => ({
        kind: 'skip' as const,
        url: url.toString(),
        reason: e.message,
      }));
    if (res.kind === 'skip') return { ok: false as const, error: `Page non lue : ${res.reason}.` };
    if (res.kind !== 'response' || !res.body || res.status >= 400)
      return {
        ok: false as const,
        error: `Page non lue (HTTP ${'status' in res ? res.status : '?'}).`,
      };
    if (/pdf/i.test(res.contentType ?? ''))
      return {
        ok: false as const,
        error: 'Cette adresse renvoie un PDF : les livrets PDF ne sont pas encore lus.',
      };
    const { extractSections } = await import('@/lib/connectors/univ-sites/sections');
    const { classifyCourse } = await import('@/lib/domain/course-categories');
    const x = extractSections(res.body.toString('utf8'));
    const blocks = x.semesters?.value ?? [];
    const semesters = blocks
      .filter((b) => b.units.length)
      .slice(0, 8)
      .map((b) => ({
        label: b.label.slice(0, 60),
        title: '',
        ects: 30,
        courses: b.units.slice(0, 60).map((u) => ({
          label: u.title.slice(0, 200),
          ects: u.ects,
          category: classifyCourse(u.title, { mentionName: program.mention.name }),
          categoryLocked: false,
        })),
        milestones: [] as { kind: 'INTERNSHIP'; title: string; detail: string }[],
      }));
    if (!semesters.length)
      return {
        ok: false as const,
        error: 'Aucun cours reconnu sur cette page. Saisis le programme à la main.',
      };
    return {
      ok: true as const,
      semesters,
      source: `${url.hostname}${x.documentYear ? ` · ${x.documentYear}` : ''}`,
    };
  });
}
