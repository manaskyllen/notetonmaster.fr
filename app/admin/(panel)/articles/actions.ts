'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { analyse, adminLinkContext } from '@/lib/articles/admin';
import { cityScope } from '@/lib/articles/figures';
import { loadFigures } from '@/lib/articles/figures.server';
import { BODY_MAX, isValidSlug, LEDE_MAX, SLUG_MAX, slugify, THEMES } from '@/lib/articles/model';
import { tokenMenu, tokenValues } from '@/lib/articles/tokens';
import { audit, change } from '@/lib/audit';
import { guard } from '@/lib/auth/admin';
import { expireTags } from '@/lib/cache/next';
import { TAGS } from '@/lib/cache/tags';
import { prisma } from '@/lib/db';
import type { Article } from '@/lib/db/generated/client';

/**
 * Guides (articles) in the admin: editor and admin roles only (`articles.edit`), checked in every
 * action. Creation, publication, unpublication and slug changes are written to the audit log.
 */

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });
const firstError = (e: z.ZodError) => e.issues[0]?.message ?? 'Champs à corriger.';

const words = z.array(z.string().trim().min(1).max(120)).max(30);
const saveSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().max(200, 'Titre : 200 caractères au plus.'),
  slug: z.string().trim().max(SLUG_MAX),
  city: z.string().trim().min(1).max(80).nullable(),
  theme: z.enum(THEMES.map((t) => t.id) as [string, ...string[]]),
  lede: z.string().max(LEDE_MAX, `Chapô : ${LEDE_MAX} caractères au plus.`),
  body: z.string().max(BODY_MAX, 'Le texte est trop long.'),
  metaDescription: z.string().trim().max(300),
  keyword: z.string().trim().max(120),
  secondaryKeywords: words,
  searchKeywords: words,
  relatedSlugs: z.array(z.string().max(SLUG_MAX)).max(6),
  signature: z.string().trim().max(120),
});
export type SaveInput = z.infer<typeof saveSchema>;

const label = (a: Pick<Article, 'title'>) => `Guide · ${a.title || 'sans titre'}`;

/** Guides on the site, their pages, the sitemap and the city pages: expired after a change. */
function expirePublic(slugs: string[] = []) {
  expireTags([TAGS.articles]);
  revalidatePath('/guides');
  for (const s of slugs) revalidatePath(`/guides/${s}`);
}

/** A new draft, then the editor. */
export async function createArticle(): Promise<{ ok: true; id: string } | Fail> {
  return guard('articles.edit', async (admin) => {
    let slug = 'nouveau-guide';
    for (let i = 2; await prisma.article.findUnique({ where: { slug }, select: { id: true } }); i++)
      slug = `nouveau-guide-${i}`;
    const a = await prisma.article.create({
      data: { title: 'Nouveau guide', slug, createdById: admin.id, updatedById: admin.id },
    });
    await audit(admin, 'ARTICLES', label(a), `Brouillon créé : /guides/${slug}`, {
      action: 'a créé le guide',
      target: { type: 'ARTICLE', id: a.id },
    });
    revalidatePath('/admin/articles');
    return { ok: true as const, id: a.id };
  });
}

/**
 * Saves the editor (autosave of a draft, or « Mettre à jour » of a published guide). A new slug
 * leaves a 301 from the former one. The city must be open (or stay the one already set).
 */
export async function saveArticle(
  raw: unknown,
): Promise<{ ok: true; slug: string; savedAt: string } | Fail> {
  return guard('articles.edit', async (admin) => {
    const p = saveSchema.safeParse(raw);
    if (!p.success) return fail(firstError(p.error));
    const d = p.data;
    const before = await prisma.article.findUnique({ where: { id: d.id } });
    if (!before) return fail('Guide introuvable.');
    const slug = d.slug === before.slug ? d.slug : slugify(d.slug);
    if (!isValidSlug(slug))
      return fail('Adresse : 3 caractères au moins, minuscules, chiffres et tirets.');
    if (slug !== before.slug) {
      const [taken, redirect] = await Promise.all([
        prisma.article.findUnique({ where: { slug }, select: { id: true } }),
        prisma.articleSlugRedirect.findUnique({ where: { slug } }),
      ]);
      if (taken || (redirect && redirect.articleId !== before.id))
        return fail('Cette adresse est déjà prise par un autre guide.');
    }
    if (d.city && d.city !== before.city) {
      const z = await prisma.launchZone.findUnique({ where: { slug: d.city } });
      if (!z?.open) return fail('Choisis une ville ouverte.');
    }
    const related = [...new Set(d.relatedSlugs.filter((s) => s !== slug))];
    const data = {
      title: d.title,
      slug,
      city: d.city,
      theme: d.theme as Article['theme'],
      lede: d.lede.trim(),
      body: d.body,
      metaDescription: d.metaDescription,
      keyword: d.keyword,
      secondaryKeywords: d.secondaryKeywords,
      searchKeywords: d.searchKeywords,
      relatedSlugs: related,
      signature: d.signature || null,
      updatedById: admin.id,
    };
    const after = await prisma.$transaction(async (tx) => {
      if (slug !== before.slug) {
        // The former address answers 301; the new one is no longer a redirect.
        await tx.articleSlugRedirect.deleteMany({ where: { slug } });
        await tx.articleSlugRedirect.upsert({
          where: { slug: before.slug },
          create: { slug: before.slug, articleId: before.id },
          update: { articleId: before.id },
        });
        // Links of « À lire aussi » follow the guide.
        await tx.$executeRaw`
          UPDATE "Article" SET "relatedSlugs" = array_replace("relatedSlugs", ${before.slug}, ${slug})
           WHERE ${before.slug} = ANY("relatedSlugs")`;
      }
      return tx.article.update({ where: { id: before.id }, data });
    });
    if (slug !== before.slug)
      await audit(
        admin,
        'ARTICLES',
        label(after),
        `Adresse changée : redirection 301 depuis l’ancienne`,
        {
          action: 'a changé l’adresse du guide',
          target: { type: 'ARTICLE', id: before.id },
          diff: [change('Adresse', `/guides/${before.slug}`, `/guides/${slug}`)],
        },
      );
    if (before.online || after.online) expirePublic([before.slug, slug]);
    revalidatePath('/admin/articles');
    return { ok: true as const, slug, savedAt: after.updatedAt.toISOString() };
  });
}

const previewSchema = z.object({
  title: z.string().max(200),
  lede: z.string().max(LEDE_MAX * 2),
  body: z.string().max(BODY_MAX),
  metaDescription: z.string().max(300),
  keyword: z.string().max(120),
  city: z.string().max(80).nullable(),
});

/**
 * The text as the editor shows it (tokens as pills, blocks as cards) and as the site will (the
 * « Aperçu » tab), with the real figures, the SEO checklist and what blocks the publication.
 */
export async function previewArticle(raw: unknown) {
  return guard('articles.edit', async () => {
    const p = previewSchema.safeParse(raw);
    if (!p.success) return fail('Aperçu impossible.');
    const ctx = await adminLinkContext();
    const [edit, preview] = await Promise.all([
      analyse(p.data, 'edit', ctx),
      analyse(p.data, 'preview', ctx),
    ]);
    const f = preview.figures;
    return {
      ok: true as const,
      editHtml: edit.render.html,
      previewHtml: preview.render.html,
      toc: preview.render.toc,
      checklist: preview.checklist,
      score: preview.score,
      words: preview.render.words,
      issues: preview.render.issues,
      blockers: preview.blockers,
      tokens: Object.fromEntries(
        preview.render.tokens.map((c) => [c, tokenValues(`{{${c}}}`, f)[c] ?? null]),
      ),
      // Menu « Chiffre »: the tokens of this city (or of every city), with their value.
      menu: tokenMenu(
        !!f.city,
        f.universities.map((u) => ({ slug: u.slug, name: u.name })),
      ).map((t) => ({ ...t, value: tokenValues(`{{${t.code}}}`, f)[t.code] ?? null })),
      session: f.session,
      dataUpdatedAt: f.dataUpdatedAt,
      cityName: f.city?.name ?? null,
    };
  });
}

/**
 * Publishes now, or on a date (« Programmer »). Refused while a token or a block is unknown, a
 * link broken, the city closed, or a required field empty. The first publication counts as a
 * review of the figures (`reviewedValues`).
 */
export async function publishArticle(
  id: unknown,
  at?: unknown,
): Promise<{ ok: true; message: string } | (Fail & { blockers?: string[] })> {
  return guard('articles.edit', async (admin) => {
    if (typeof id !== 'string') return fail('Guide introuvable.');
    const a = await prisma.article.findUnique({ where: { id } });
    if (!a) return fail('Guide introuvable.');
    let when: Date | null = null;
    if (at !== undefined && at !== null && at !== '') {
      when = new Date(String(at));
      if (Number.isNaN(when.getTime())) return fail('Date de publication invalide.');
    }
    const { blockers, figures } = await analyse(a, 'preview');
    if (blockers.length) return { ok: false as const, error: 'Publication impossible.', blockers };
    const now = new Date();
    const scheduled = !!when && when > now;
    const publishedAt = scheduled
      ? when!
      : a.online && a.publishedAt
        ? a.publishedAt
        : (when ?? now);
    await prisma.article.update({
      where: { id },
      data: {
        online: true,
        status: scheduled ? 'SCHEDULED' : 'PUBLISHED',
        publishedAt,
        ...(a.reviewedAt ? {} : { reviewedAt: now, reviewedValues: tokenValues(a.body, figures) }),
        updatedById: admin.id,
      },
    });
    const date = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    }).format(publishedAt);
    await audit(
      admin,
      'ARTICLES',
      label(a),
      scheduled ? `Programmé pour le ${date} : /guides/${a.slug}` : `En ligne : /guides/${a.slug}`,
      {
        action: scheduled ? 'a programmé le guide' : 'a publié le guide',
        target: { type: 'ARTICLE', id },
        diff: [
          change(
            'Statut',
            a.online ? 'En ligne' : 'Hors ligne',
            scheduled ? `Programmé (${date})` : 'En ligne',
          ),
        ],
      },
    );
    expirePublic([a.slug]);
    revalidatePath('/sitemap.xml');
    revalidatePath('/admin/articles');
    return {
      ok: true as const,
      message: scheduled ? `Programmé pour le ${date}.` : 'Guide publié.',
    };
  });
}

/** Takes a guide offline (back to draft): its address answers 404. */
export async function unpublishArticle(id: unknown): Promise<{ ok: true; message: string } | Fail> {
  return guard('articles.edit', async (admin) => {
    if (typeof id !== 'string') return fail('Guide introuvable.');
    const a = await prisma.article.findUnique({ where: { id } });
    if (!a) return fail('Guide introuvable.');
    await prisma.article.update({
      where: { id },
      data: { online: false, status: 'DRAFT', updatedById: admin.id },
    });
    await audit(admin, 'ARTICLES', label(a), `Hors ligne : /guides/${a.slug} répond 404`, {
      action: 'a dépublié le guide',
      target: { type: 'ARTICLE', id },
      diff: [change('Statut', a.online ? 'En ligne' : 'Hors ligne', 'Brouillon')],
    });
    expirePublic([a.slug]);
    revalidatePath('/sitemap.xml');
    revalidatePath('/admin/articles');
    return { ok: true as const, message: 'Guide dépublié : il est redevenu un brouillon.' };
  });
}

/**
 * « Marquer comme relu »: the values of the tokens quoted in the text become the reference of
 * « À relire », and the guide goes back to its status (published, scheduled or draft).
 */
export async function markReviewed(id: unknown): Promise<{ ok: true; message: string } | Fail> {
  return guard('articles.edit', async (admin) => {
    if (typeof id !== 'string') return fail('Guide introuvable.');
    const a = await prisma.article.findUnique({ where: { id } });
    if (!a) return fail('Guide introuvable.');
    const f = await loadFigures(cityScope(a.city));
    const now = new Date();
    const status =
      a.status !== 'TO_REVIEW'
        ? a.status
        : !a.online
          ? 'DRAFT'
          : a.publishedAt && a.publishedAt > now
            ? 'SCHEDULED'
            : 'PUBLISHED';
    await prisma.article.update({
      where: { id },
      data: {
        reviewedAt: now,
        reviewedValues: tokenValues(a.body, f),
        status,
        updatedById: admin.id,
      },
    });
    await audit(admin, 'ARTICLES', label(a), 'Chiffres relus', {
      action: 'a marqué comme relu le guide',
      target: { type: 'ARTICLE', id },
    });
    revalidatePath(`/admin/articles/${id}`);
    revalidatePath('/admin/articles');
    return { ok: true as const, message: 'Marqué comme relu.' };
  });
}
