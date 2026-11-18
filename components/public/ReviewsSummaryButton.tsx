'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatGrade } from '@/components/ui/Grade';
import { gradeColor } from '@/lib/domain/rating';

/** Event asking the tabs of the program page to show one panel (ParcoursTabs listens to it). */
export const FICHE_TAB_EVENT = 'nm:fiche-tab';

export function openFicheTab(id: string) {
  window.dispatchEvent(new CustomEvent(FICHE_TAB_EVENT, { detail: id }));
}

/**
 * « Note · 12 avis d'étudiant·es · 8 vérifiés · 83 % le recommandent · Lire les avis ↓ » in the
 * hero. A click opens the « Avis » tab with the « Tous » filter and scrolls to it.
 */
export function ReviewsSummaryButton({
  slug,
  levelFiltered,
  summary,
}: {
  slug: string;
  /** The list below is filtered (?niveau=…): the click reloads it with « Tous ». */
  levelFiltered: boolean;
  summary: { count: number; avg: number | null; verified: number; recommendShare: number | null };
}) {
  const router = useRouter();
  const go = () => {
    openFicheTab('avis');
    if (levelFiltered) {
      router.push(`/parcours/${slug}#avis`);
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById('avis')
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#avis`);
  };
  const { count, avg, verified, recommendShare } = summary;
  if (!count || avg == null)
    return (
      <Link
        href={`/avis/nouveau?parcours=${slug}`}
        className="mt-1.5 inline-flex min-h-13 items-center gap-3 self-start rounded-[18px] bg-white px-4 py-2 text-left text-[15px] font-bold text-[#16131f] no-underline"
      >
        <span className="flex flex-col gap-0.5">
          <span>Pas encore d’avis</span>
          <span className="font-semibold text-[#3b23b8]">
            Tu as suivi ce master ? Donne le premier avis
          </span>
        </span>
      </Link>
    );
  const note = formatGrade(Math.round(avg * 10) / 10);
  return (
    <button
      type="button"
      onClick={go}
      className="mt-1.5 inline-flex cursor-pointer items-center gap-3 self-start rounded-[18px] border-0 bg-white py-2 pr-4 pl-2 text-left font-sans text-[#16131f]"
    >
      <span
        role="img"
        aria-label={`Note globale : ${note} sur 5`}
        style={{ backgroundColor: gradeColor(avg) }}
        className="inline-flex -rotate-3 items-baseline rounded-[12px] px-3 pt-1.5 pb-2 font-display text-[28px] leading-none font-extrabold"
      >
        <span aria-hidden="true">{note}</span>
        <span aria-hidden="true" className="text-[15px] text-[#3b3648]">
          /5
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold">
          {count} avis d’étudiant·es
          {verified ? ` · ${verified} vérifié${verified > 1 ? 's' : ''}` : ''}
        </span>
        <span className="text-[13px] font-semibold text-[#3b23b8]">
          {recommendShare != null ? `${recommendShare} % le recommandent · ` : ''}Lire les avis ↓
        </span>
      </span>
    </button>
  );
}
