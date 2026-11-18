import { serializeJsonLd } from '@/lib/seo/jsonld';

/** A JSON-LD block (lib/seo/jsonld.ts). Data, not a script: the CSP does not apply to it. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    // html-safe: JSON built by the server from catalogue data, `<` escaped (serializeJsonLd).
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
