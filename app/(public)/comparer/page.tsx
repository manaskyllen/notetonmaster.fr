import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, SourceLine } from '@/components/public/PageShell';
import { seoMetadata } from '@/lib/seo/meta';
import { ComparePicker } from '@/components/public/ComparePicker';
import { BrandName } from '@/components/ui/BrandName';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { computeSelectivity } from '@/lib/domain/selectivity';
import { formatInt, formatRating, NC } from '@/lib/format';
import { getProgramSummaries, type ProgramSummary } from '@/lib/queries/catalog';
import { MODALITY_LABEL, uniTone } from '@/lib/ui-helpers';

/** A comparison is a view of other pages: noindex, follow. */
export function generateMetadata(): Metadata {
  return seoMetadata({
    title: 'Comparer des parcours de master | notetonmaster',
    description:
      'Jusqu’à 3 parcours de master côte à côte : places, candidatures, sélectivité, stages, programme et avis d’étudiant·es.',
    canonical: '/comparer',
    noindex: true,
  });
}

export const dynamic = 'force-dynamic';

type Cell = { text: string; value?: number | null };
type Row = { label: string; cells: Cell[]; best?: 'max' | 'min' };

export default async function ComparerPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: raw } = await searchParams;
  const asked = (raw ?? '').split(',').filter(Boolean).slice(0, 3);
  const all = await getProgramSummaries(asked);
  const ids = asked.filter((s) => all.some((p) => p.slug === s));
  const cols: (ProgramSummary | null)[] = [0, 1, 2].map(
    (i) => all.find((p) => p.slug === ids[i]) ?? null,
  );
  const chosen = cols.filter((c): c is ProgramSummary => !!c);
  // No comparison without 2 parcours: no empty table, a way to pick them instead.
  if (chosen.length < 2) return <NotEnough picked={chosen} />;

  const cell = (fn: (p: ProgramSummary) => Cell): Cell[] =>
    cols.map((p) => (p ? fn(p) : { text: '' }));
  const rows: Row[] = [
    {
      label: 'Lieu',
      cells: cell((p) => ({ text: [p.city, p.component].filter(Boolean).join(' · ') })),
    },
    {
      label: 'Modalité',
      cells: cell((p) => ({
        text: MODALITY_LABEL[p.modality] + (p.entryLevel === 'M2' ? ' · entrée en M2' : ''),
      })),
    },
    {
      label: 'Places',
      best: 'max',
      cells: cell((p) => ({ text: formatInt(p.admission.capacity), value: p.admission.capacity })),
    },
    { label: 'Candidatures', cells: cell((p) => ({ text: formatInt(p.admission.applications) })) },
    { label: 'Propositions', cells: cell((p) => ({ text: formatInt(p.admission.offers) })) },
    {
      label: 'Accessibilité',
      best: 'max',
      cells: cell((p) => {
        const s = computeSelectivity(p.admission.applications, p.admission.offers);
        if (s.ratio != null)
          return {
            text: s.text,
            value: (p.admission.offers ?? 0) / (p.admission.applications ?? 1),
          };
        if (p.admission.accessRate != null)
          return {
            text: `Taux d’accès ${formatInt(p.admission.accessRate)} % (rentrée ${p.admission.accessRateSession})`,
            value: p.admission.accessRate / 100,
          };
        return { text: NC };
      }),
    },
    {
      label: 'Stages',
      cells: cell((p) => ({
        text:
          p.internships ??
          (p.modality === 'WORK_STUDY' ? 'Alternance (apprentissage ou contrat pro)' : NC),
      })),
    },
    { label: 'Programme publié', cells: cell((p) => ({ text: p.programmeSource ?? NC })) },
    {
      label: 'À noter',
      cells: cell((p) => ({
        text: [...p.highlights, p.requirements].filter(Boolean).join(' · ') || '—',
      })),
    },
    {
      label: 'Avis étudiants',
      cells: cell((p) => ({
        text:
          p.reviewCount && p.avgRating != null
            ? `${formatRating(p.avgRating)}/5 · ${p.reviewCount} avis`
            : 'Aucun pour l’instant',
      })),
    },
  ];

  const bestOf = (r: Row) => {
    if (!r.best) return null;
    const nums = r.cells.map((c) => c.value).filter((v): v is number => typeof v === 'number');
    if (nums.length < 2) return null;
    return r.best === 'max' ? Math.max(...nums) : Math.min(...nums);
  };

  return (
    <main>
      <Container className="flex flex-col gap-6 pt-8 pb-20">
        <Link
          href={`/explorer${ids.length ? `?comparer=${ids.join(',')}` : ''}`}
          className="inline-flex min-h-tap items-center gap-1.5 self-start text-[15px] font-semibold text-ink no-underline"
        >
          <Icon name="arrow-left" size={18} />
          Retour à Explorer pour changer la sélection
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-display text-[clamp(36px,5vw,56px)] leading-none font-extrabold tracking-[-0.035em]">
            Comparer
          </h1>
          <p className="m-0 text-body-l text-ink-muted">
            Jusqu’à 3 parcours côte à côte. Les cases{' '}
            <span className="rounded-[6px] bg-lime-400 px-1.5 font-bold text-on-lime">
              surlignées
            </span>{' '}
            montrent la valeur la plus favorable de la ligne.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-0">
          <table className="w-full min-w-[760px] border-collapse text-[15px]">
            <caption className="sr-only">Comparaison de parcours</caption>
            <colgroup>
              <col className="w-[18%]" />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="border-b border-border p-5 text-left align-bottom text-label text-ink-muted uppercase"
                >
                  Parcours
                </th>
                {cols.map((p, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="border-b border-border p-5 text-left align-top font-normal"
                  >
                    <div className="flex flex-col gap-2.5">
                      <ComparePicker index={i} ids={ids} current={p?.title ?? null} />
                      {p ? (
                        // Keyed by program: a column that gets a program fades in.
                        <span key={p.slug} className="nm-colfade flex flex-col gap-2.5">
                          <span
                            className={cn(
                              'self-start rounded-pill px-2.5 py-1 text-[12px] font-bold',
                              uniTone(p.university.position),
                            )}
                          >
                            {p.university.shortName ?? p.university.name}
                          </span>
                          <Link
                            href={`/parcours/${p.slug}`}
                            className="font-display text-[19px] leading-[1.15] font-bold text-ink"
                          >
                            {p.title}
                          </Link>
                        </span>
                      ) : (
                        <span className="text-[14px] text-ink-muted">Aucun parcours choisi</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const best = bestOf(r);
                return (
                  <tr key={r.label}>
                    <th
                      scope="row"
                      className="border-b border-border px-5 py-4 text-left align-top text-[14px] font-semibold text-ink-muted"
                    >
                      {r.label}
                    </th>
                    {r.cells.map((c, i) => {
                      const hl = best != null && c.value === best;
                      return (
                        <td key={i} className="border-b border-border px-5 py-4 align-top">
                          <span
                            key={cols[i]?.slug ?? 'none'}
                            className={cn(
                              'nm-colfade',
                              hl && 'rounded-[8px] bg-lime-400 px-2 py-0.5 font-bold text-on-lime',
                              c.text === NC && 'text-ink-muted',
                            )}
                          >
                            {c.text}
                            {hl && <span className="sr-only"> (meilleure valeur)</span>}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <SourceLine>
          Sources : Mon Master (données ouvertes, rentrée 2025), sites et brochures des universités.
          « n.c. » : non communiqué par la source. La sélectivité est un calcul <BrandName />, pas
          un taux officiel.
        </SourceLine>
      </Container>
    </main>
  );
}

function NotEnough({ picked }: { picked: ProgramSummary[] }) {
  const one = picked[0];
  return (
    <main>
      <Container className="flex flex-col gap-6 pt-8 pb-20">
        <h1 className="m-0 font-display text-[clamp(36px,5vw,56px)] leading-none font-extrabold tracking-[-0.035em]">
          Comparer
        </h1>
        <EmptyState
          title={one ? 'Ajoute au moins un 2e parcours' : 'Choisis 2 ou 3 parcours à comparer'}
          action={
            <span className="mt-3 flex flex-wrap justify-center gap-2.5">
              <Link
                href={`/explorer${one ? `?comparer=${one.slug}` : ''}`}
                className={buttonClasses('primary', 'm')}
              >
                Choisir dans Explorer
              </Link>
              <Link href="/espace/suivis" className={buttonClasses('outline', 'm')}>
                Mes masters suivis
              </Link>
            </span>
          }
        >
          {one
            ? `${one.title} est prêt à être comparé. Coche un ou deux autres parcours avec « Comparer ».`
            : 'Coche « Comparer » sur les cartes d’Explorer ou dans tes masters suivis : la comparaison s’ouvre à partir de 2 parcours.'}
        </EmptyState>
      </Container>
    </main>
  );
}
