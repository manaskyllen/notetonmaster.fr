/** Default share image (lib/seo/meta.ts, app/og/site-v2.png): the home headline, a versioned name. */
import { describe, expect, it } from 'vitest';
import { HOME_HEADLINE, HOME_HEADLINE_TEXT } from '@/lib/brand/copy';
import { SITE_OG_IMAGE, seoMetadata } from '@/lib/seo/meta';

describe('default share image', () => {
  it('reads the home headline in one go, a narrow no-break space before « ? »', () => {
    expect(HOME_HEADLINE_TEXT).toBe('Ton master, tu lui mets combien ?');
    expect(HOME_HEADLINE.highlight).toBe('combien ?');
    expect(SITE_OG_IMAGE.alt).toBe(`notetonmaster · ${HOME_HEADLINE_TEXT}`);
  });

  it('is the og:image and twitter:image of a page without its own, without parameters', () => {
    const m = seoMetadata({ title: 't', description: 'd', canonical: '/' });
    const og = (m.openGraph!.images as { url: string; alt: string }[])[0]!;
    expect(og.url).toMatch(/\/og\/site-v2\.png$/);
    expect(og.alt).toBe(SITE_OG_IMAGE.alt);
    expect(m.twitter!.images).toEqual([og.url]);
    expect(JSON.stringify(m)).not.toMatch(/brochure|racontent/);
  });
});
