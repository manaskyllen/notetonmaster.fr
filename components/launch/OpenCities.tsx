import { BrandName } from '@/components/ui/BrandName';

export { OpenCitiesLine } from './OpenCitiesLine';

/** Why a city is not there yet: the same words on the card, the « pas encore » page and ⌘K. */
export const NOT_YET_TEXT =
  'On ouvre les villes petit à petit, pour avoir assez d’avis dans chacune avant de la mettre en ligne. La tienne arrive bientôt.';

/**
 * « Lyon n'est pas encore sur notetonmaster »: a place known but not open yet, in
 * place of an empty result, and the « Pas encore sur notetonmaster » page. No list of cities:
 * the line under the search already names them.
 */
export function NotYetOpen({ place, headingLevel = 2 }: { place: string; headingLevel?: 1 | 2 }) {
  const H = `h${headingLevel}` as 'h1' | 'h2';
  return (
    <div className="flex flex-col items-center gap-3 rounded-[24px] border-2 border-ink bg-surface-0 px-6 py-8 text-center">
      <H className="m-0 font-display text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em]">
        {place} n’est pas encore sur <BrandName size="lg" />
      </H>
      <p className="m-0 max-w-[520px] text-[15px] leading-[1.5] text-ink-soft">{NOT_YET_TEXT}</p>
    </div>
  );
}
