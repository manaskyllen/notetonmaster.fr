/**
 * What the fiche shows of the cursus of a parcours (issue #21). Pure: the page gives the numbers
 * of the parcours, their admission figures and the « Mène vers : » typed in the admin.
 */
import { cursusKind, type CursusKind } from './variants';

/** Cursus shown as cards up to this many; beyond, a compact table (6 rows then « Voir les N … »). */
export const CURSUS_VISIBLE = 6;

export interface CursusEntryInput {
  id: string;
  code: string;
  cursusLabel: string | null;
  lastSession: number | null;
}

export interface CursusStatInput {
  monMasterEntryId: string | null;
  session: number;
  capacity: number | null;
  applications: number | null;
  offers: number | null;
}

export interface CursusItem {
  code: string;
  label: string | null;
  places: number | null;
  applications: number | null;
  /** Offers / applications × 100 (the site's access rate), rounded. */
  rate: number | null;
  leadsTo: string | null;
  url: string | null;
}

export interface CursusView {
  kind: CursusKind;
  items: CursusItem[];
  totalPlaces: number | null;
  rateMin: number | null;
  rateMax: number | null;
  session: number | null;
  /** Hero chip (« 3 cursus : Strasbourg, Kehl, Passau ↓ », « Aussi en alternance ↓ »), or none. */
  chip: string | null;
  /** The M2 differs from one cursus to the other: the Programme tab says so, with an example. */
  m2: { label: string; leadsTo: string } | null;
}

/** Fiche of a number on the candidate site (the same link as the « Fiche d'identité »). */
export const monMasterUrl = (uai: string | null, code: string) =>
  uai ? `https://monmaster.gouv.fr/formation/${uai}/${code}/detail` : null;

export function cursusView(
  entries: CursusEntryInput[],
  stats: CursusStatInput[],
  leadsTo: Map<string, string>,
  uai: string | null,
): CursusView {
  const latest = Math.max(0, ...entries.map((e) => e.lastSession ?? 0));
  const live = entries.filter((e) => (e.lastSession ?? 0) === latest);
  const items: CursusItem[] = live.map((e) => {
    const s = stats
      .filter((x) => x.monMasterEntryId === e.id)
      .sort((a, b) => b.session - a.session)[0];
    return {
      code: e.code,
      label: e.cursusLabel,
      places: s?.capacity ?? null,
      applications: s?.applications ?? null,
      rate:
        s?.applications && s.offers != null
          ? Math.round(Math.min(100, (100 * s.offers) / s.applications))
          : null,
      leadsTo: leadsTo.get(e.code) ?? null,
      url: monMasterUrl(uai, e.code),
    };
  });
  items.sort((a, b) => (b.places ?? -1) - (a.places ?? -1) || a.code.localeCompare(b.code));
  const kind = cursusKind(items.map((i) => i.label));
  const places = items.map((i) => i.places).filter((n): n is number => n != null);
  const rates = items.map((i) => i.rate).filter((n): n is number => n != null);
  const names = items.map((i) => i.label!).filter(Boolean);
  const chip =
    kind === 'named'
      ? items.length <= 3
        ? `${items.length} cursus : ${names.join(', ')} ↓`
        : `${items.length} cursus ↓`
      : kind === 'rhythm'
        ? 'Aussi en alternance ↓'
        : null;
  const targets = new Set(items.map((i) => i.leadsTo).filter(Boolean));
  const example = items.find((i) => i.leadsTo && i.label);
  return {
    kind,
    items,
    totalPlaces: places.length ? places.reduce((a, b) => a + b, 0) : null,
    rateMin: rates.length ? Math.min(...rates) : null,
    rateMax: rates.length ? Math.max(...rates) : null,
    session: latest || null,
    chip,
    m2:
      (kind === 'named' || kind === 'rhythm') && targets.size > 1 && example
        ? { label: example.label!, leadsTo: example.leadsTo! }
        : null,
  };
}
