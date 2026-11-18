import { getCityMention, getCityOverview } from '@/lib/catalog/cities';
import { prisma } from '@/lib/db';
import { splitParcoursTitle } from '@/lib/domain/titles';
import { getMention, getProgram, getUniversity } from '@/lib/queries/catalog';
import { ogCard, type OgCard } from '@/lib/seo/og-card';
import { deMention } from '@/lib/seo/titles';

const nf = new Intl.NumberFormat('fr-FR');
const rated = (avg: number | null | undefined, count: number) =>
  avg != null && count > 0 ? { value: avg, count } : null;

async function card(kind: string, slug: string): Promise<OgCard | null> {
  if (kind === 'parcours') {
    const p = await getProgram(slug);
    if (!p) return null;
    return {
      kicker: `Master ${p.mention.name}`.slice(0, 60),
      title: splitParcoursTitle(p.title).title,
      subtitle: `${p.university.name} · ${p.city}`,
      tone: 'violet',
      rating: rated(p.avgRating, p.reviewCount),
      figure: 'Programme, admission · donne le premier avis',
    };
  }
  if (kind === 'mention') {
    const m = await getMention(slug);
    if (!m) return null;
    return {
      kicker: 'Mention de master',
      title: m.name,
      subtitle: `${nf.format(m.figures.programs)} parcours · ${nf.format(m.figures.universities)} établissements`,
      tone: 'night',
      rating: rated(m.avgRating, m.reviewCount),
    };
  }
  if (kind === 'universite') {
    const u = await getUniversity(slug);
    if (!u) return null;
    const f = await prisma.programSearchIndex.count({
      where: { universityId: u.id, isPublicSector: true },
    });
    return {
      kicker: 'Établissement',
      title: u.name,
      subtitle: `${u.cities.slice(0, 3).join(' · ')} · ${nf.format(f)} parcours`,
      tone: 'night',
      rating: rated(u.avgRating, u.reviewCount),
    };
  }
  if (kind === 'ville') {
    const [city, mention] = slug.split('--');
    if (mention) {
      const c = await getCityMention(city!, mention);
      if (!c) return null;
      const reviews = c.programs.filter((p) => p.avgRating != null);
      const avg = reviews.length
        ? reviews.reduce((s, p) => s + p.avgRating! * p.reviewCount, 0) / Math.max(1, c.reviews)
        : null;
      return {
        kicker: c.zone.name,
        title: `Masters ${deMention(c.mention.name)} à ${c.zone.name}`,
        subtitle: `${nf.format(c.programs.length)} parcours · ${nf.format(c.universities)} établissements publics`,
        tone: 'violet',
        rating: rated(avg, c.reviews),
      };
    }
    const c = await getCityOverview(city!);
    if (!c) return null;
    return {
      kicker: 'Ville ouverte',
      title: `Les masters à ${c.zone.name}`,
      subtitle: `${nf.format(c.programs)} parcours · ${nf.format(c.universities.length)} établissements publics`,
      tone: 'night',
      figure: c.reviews ? `${nf.format(c.reviews)} avis d’étudiant·es` : null,
    };
  }
  return null;
}

/**
 * Share image of a public page (lib/seo/og-path.ts): /og/parcours/<slug>.png?v=<version>. The
 * version follows the rating and the number of reviews: a versioned address is cached for a
 * year, a bare one for an hour.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ kind: string; file: string }> },
) {
  const { kind, file } = await params;
  const slug = file.replace(/\.png$/, '');
  if (!file.endsWith('.png') || !/^[a-z0-9-]+$/.test(slug))
    return new Response('Introuvable', { status: 404 });
  const c = await card(kind, slug);
  if (!c) return new Response('Introuvable', { status: 404 });
  const img = await ogCard(c);
  const versioned = new URL(req.url).searchParams.has('v');
  img.headers.set(
    'Cache-Control',
    versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  );
  return img;
}
