import { CURSUS_VISIBLE, type CursusItem, type CursusView } from '@/lib/catalog/cursus-view';
import { formatInt } from '@/lib/format';
import { CursusTable } from './CursusTable';

/**
 * First section of the Admission tab of a parcours with several cursus (issue #21, mockup
 * ParcoursCursus.dc.html): « Choisis ton cursus » (named by a place or a suffix), « Choisis ton
 * rythme » (initial / work-study pair), or « N fiches Mon Master pour ce parcours » (numbers that
 * nothing tells apart). The anchor #cursus is where the hero chip leads.
 */
export function ParcoursCursus({ view }: { view: CursusView }) {
  if (view.kind === 'single') return null;
  const n = view.items.length;
  const totals = (
    <div className="flex gap-5.5">
      {view.totalPlaces != null && (
        <span className="flex flex-col gap-1">
          <span className="font-display text-[24px] leading-none font-extrabold tracking-[-0.02em]">
            {formatInt(view.totalPlaces)}
          </span>
          <span className="text-[12px] leading-[1.3] text-ink-muted">places au total</span>
        </span>
      )}
      {view.rateMin != null && view.rateMax != null && (
        <span className="flex flex-col gap-1">
          <span className="font-display text-[24px] leading-none font-extrabold tracking-[-0.02em]">
            {view.rateMin === view.rateMax ? `${view.rateMin} %` : `${view.rateMin} à ${view.rateMax} %`}
          </span>
          <span className="text-[12px] leading-[1.3] text-ink-muted">
            taux d’accès selon {view.kind === 'unnamed' ? 'la fiche' : view.kind === 'rhythm' ? 'le rythme' : 'le cursus'}
          </span>
        </span>
      )}
    </div>
  );
  const source = (
    <p className="m-0 text-[13px] text-ink-muted">
      Données : Mon Master, campagne {view.session ? `${view.session}` : 'précédente'} · taux d’accès =
      propositions / candidatures.
    </p>
  );

  if (view.kind === 'unnamed')
    return (
      <section
        id="cursus"
        aria-labelledby="cu-title"
        className="flex scroll-mt-6 flex-col gap-4 rounded-[24px] border border-border bg-surface-0 p-7 max-[900px]:p-4.5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3.5">
          <div className="flex max-w-[720px] flex-col gap-1.5">
            <h2 id="cu-title" className="m-0 font-display text-[22px] font-extrabold tracking-[-0.02em]">
              {n} fiches Mon Master pour ce parcours
            </h2>
            <p className="m-0 text-[15px] text-ink-soft">
              Mon Master publie plusieurs fiches pour ce parcours sans préciser ce qui les distingue
              (discipline, site ou rythme). Consulte chaque fiche avant de candidater.
            </p>
          </div>
          {totals}
        </div>
        <CursusTable items={view.items} firstColumn="Fiche Mon Master" moreLabel={`Voir les ${n} fiches`} />
        {source}
      </section>
    );

  const rhythm = view.kind === 'rhythm';
  return (
    <section
      id="cursus"
      aria-labelledby="cu-title"
      className="flex scroll-mt-6 flex-col gap-5.5 rounded-[24px] border border-border bg-surface-0 p-7 max-[900px]:p-4.5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="flex max-w-[720px] flex-col gap-1.5">
          <h2 id="cu-title" className="m-0 font-display text-[28px] font-extrabold tracking-[-0.02em]">
            {rhythm ? 'Choisis ton rythme' : 'Choisis ton cursus'}
          </h2>
          <p className="m-0 text-[15px] text-ink-soft">
            {rhythm ? (
              <>
                Tu candidates à un rythme précis : chacun a sa fiche Mon Master. Même diplôme et même
                équipe ; ce qui change, c’est le rythme (formation initiale ou alternance) et la
                sélectivité.
              </>
            ) : (
              <>
                Tu candidates à un cursus précis : chacun a sa fiche Mon Master. Même diplôme, même
                tronc commun et même équipe ; ce qui change, c’est le lieu ou la modalité, le M2
                auquel il mène et la sélectivité.
              </>
            )}
          </p>
        </div>
        {totals}
      </div>

      {n > CURSUS_VISIBLE ? (
        <CursusTable items={view.items} firstColumn="Cursus" moreLabel={`Voir les ${n} cursus`} />
      ) : (
        <ul className="m-0 grid list-none gap-3.5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {view.items.map((c) => (
            <CursusCard key={c.code} c={c} />
          ))}
        </ul>
      )}

      <div className="flex items-start gap-3 rounded-[16px] bg-surface-50 px-4 py-3.5 text-[14px] leading-[1.5]">
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 flex-none text-violet-500"
        >
          <rect x="4" y="10" width="16" height="11" rx="2.5" />
          <path d="M8 10V7a4 4 0 018 0v3" />
        </svg>
        <span>
          <strong>Les avis portent sur le parcours, tous {rhythm ? 'rythmes' : 'cursus'} confondus.</strong>{' '}
          Le {rhythm ? 'rythme' : 'cursus'} n’est jamais demandé ni affiché dans un avis : certains
          n’ont que quelques places, l’indiquer permettrait de reconnaître la personne.
        </span>
      </div>
      {source}
    </section>
  );
}

function CursusCard({ c }: { c: CursusItem }) {
  const fig = (value: string, label: string) => (
    <span className="flex flex-col gap-1">
      <span className="font-display text-[22px] leading-none font-extrabold tracking-[-0.02em]">{value}</span>
      <span className="text-[12px] leading-[1.3] break-words text-ink-muted">{label}</span>
    </span>
  );
  return (
    <li className="flex flex-col gap-3.5 rounded-[22px] border border-border bg-surface-0 p-5">
      <span className="font-display text-[22px] font-extrabold tracking-[-0.02em]">{c.label}</span>
      {c.leadsTo && (
        <span className="text-[14px] leading-[1.45]">
          <strong>Mène vers :</strong> {c.leadsTo}
        </span>
      )}
      <span className="grid grid-cols-3 gap-2 border-y border-border py-3">
        {fig(c.places == null ? 'n.c.' : formatInt(c.places), 'places')}
        {fig(c.applications == null ? 'n.c.' : formatInt(c.applications), 'candidatures')}
        {fig(c.rate == null ? 'n.c.' : `${c.rate} %`, 'taux d’accès')}
      </span>
      {c.url ? (
        <a href={c.url} rel="noopener noreferrer" target="_blank" className="text-[13px]">
          Fiche Mon Master <span className="font-mono text-[12px]">{c.code}</span> ↗
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
      ) : (
        <span className="text-[13px] text-ink-muted">
          Fiche Mon Master <span className="font-mono text-[12px]">{c.code}</span>
        </span>
      )}
    </li>
  );
}

/** Programme tab: the M2 depends on the cursus chosen (only when it does). */
export function CursusM2Banner({ m2, rhythm }: { m2: NonNullable<CursusView['m2']>; rhythm: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[16px] bg-violet-100 px-4.5 py-3.5 text-[15px] text-violet-700">
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-none"
      >
        <path d="M6 3v12" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="6" r="3" />
        <path d="M18 9a9 9 0 01-9 9" />
      </svg>
      <span>
        <strong>Le M2 dépend du {rhythm ? 'rythme' : 'cursus'} choisi.</strong> Le cursus «{' '}
        {m2.label} », par exemple, mène vers : {m2.leadsTo}.
      </span>
      <a
        href="#cursus"
        className="ml-auto inline-flex min-h-10 items-center rounded-pill border-[1.5px] border-current bg-surface-0 px-3.5 text-[14px] font-bold text-violet-700 no-underline"
      >
        Voir les cursus
      </a>
    </div>
  );
}
