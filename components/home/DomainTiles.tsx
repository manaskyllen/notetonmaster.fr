'use client';

import { HoverLink } from '@/components/ui/HoverLink';
import type { HomeDomain } from '@/lib/home/data';
import { domainHint, plural } from '@/lib/home/form';
import { useHomeCity } from './home-city';

/**
 * « Explorer par domaine »: the four national domains, each with its mentions that have a
 * published parcours in the city of « Où ? » (all the open cities by default), counted like
 * /mentions lists them (same index, same domain). A tile leads to /mentions filtered on its domain
 * (and the city). A domain without any mention there says « Bientôt » and is not a link.
 */
export function DomainTiles({
  domains,
  zones,
  initialCity,
  icons,
}: {
  domains: HomeDomain[];
  /** Icons of the domains, drawn by the server (no icon set in the JavaScript of the page). */
  icons: Record<string, { tile: React.ReactNode; soon: React.ReactNode }>;
  zones: { slug: string; name: string }[];
  initialCity: string | null;
}) {
  const city = useHomeCity(initialCity);
  const cityName = zones.find((z) => z.slug === city)?.name ?? null;
  const key = cityName ? city! : '';
  const at = cityName ? ` à ${cityName}` : '';
  return (
    <>
      <div className="dt-head">
        <h2 id="t-dom">Explorer par domaine</h2>
        <span>{domainHint(cityName)}</span>
      </div>
      <ul className="dt-grid">
        {domains.map((d) => {
          const n = d.mentions[key] ?? 0;
          const body = (
            <span className="dt-body">
              <span className="dt-name">{d.name}</span>
              <span className="dt-n">{n ? plural(n, 'mention', 'mentions') : 'Bientôt'}</span>
            </span>
          );
          // Not a link. The colour of the domain fades (decorative); the text keeps an AA contrast.
          if (!n)
            return (
              <li key={d.slug} className="dt dt-soon" data-tone={d.tone}>
                <span className="sr-only">
                  {d.name} : bientôt, pas encore de mention ouverte{at}
                </span>
                <span aria-hidden="true" className="dt-swatch">
                  {icons[d.slug]?.soon}
                </span>
                <span aria-hidden="true" className="contents">
                  {body}
                </span>
              </li>
            );
          return (
            <li key={d.slug} className="flex">
              <HoverLink
                href={`/mentions?domaine=${d.slug}${cityName ? `&ville=${city}` : ''}`}
                aria-label={`${d.name} : ${plural(n, 'mention', 'mentions')}${at}`}
                className="dt nm-lift"
                data-tone={d.tone}
              >
                {icons[d.slug]?.tile}
                {body}
              </HoverLink>
            </li>
          );
        })}
      </ul>
    </>
  );
}
