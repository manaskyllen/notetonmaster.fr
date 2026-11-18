import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/brand/app-icon';
import { SLOGAN_HIGHLIGHT } from '@/lib/brand/copy';
import { ogFonts } from '@/lib/brand/og-fonts';
import { gradeColor } from '@/lib/domain/rating';
import { cutWords, ratingText } from './titles';

export const OG_SIZE = { width: 1200, height: 630 };

/** The logo: « note ton » and « master » on a lime block tilted by −3°. */
function Logo({ px, color }: { px: number; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: px,
        letterSpacing: '-0.045em',
        lineHeight: 1.1,
        color,
      }}
    >
      <span>note</span>
      <span style={{ marginLeft: px * 0.14 }}>ton</span>
      <span
        style={{
          marginLeft: px * 0.07,
          padding: `${px * 0.02}px ${px * 0.26}px ${px * 0.14}px`,
          borderRadius: px * 0.32,
          background: BRAND.lime,
          color: BRAND.night,
          transform: 'rotate(-3deg)',
        }}
      >
        master
      </span>
    </div>
  );
}

export interface OgCard {
  kicker: string;
  title: string;
  subtitle: string;
  tone: 'violet' | 'night';
  rating?: { value: number; count: number } | null;
  /** Shown instead of a rating (« 213 parcours »). */
  figure?: string | null;
}

/**
 * Share image of a fiche, a mention, a university or a city: violet or night background, logo,
 * name in Bricolage, university and city, and the rating in its tilted block with the number of
 * reviews when there are some.
 */
export async function ogCard(c: OgCard): Promise<ImageResponse> {
  const bg = c.tone === 'violet' ? BRAND.violet : BRAND.night;
  const title = cutWords(c.title, 90);
  const size = title.length > 60 ? 60 : title.length > 36 ? 70 : 84;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 80px',
        background: bg,
        color: BRAND.white,
        fontFamily: 'Bricolage Grotesque',
        fontWeight: 800,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -90,
          right: -90,
          width: 300,
          height: 300,
          borderRadius: 300,
          background: c.tone === 'violet' ? BRAND.lime : BRAND.violet,
          opacity: 0.9,
        }}
      />
      <Logo px={44} color={BRAND.white} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1000 }}>
        <span
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            padding: '6px 16px',
            borderRadius: 999,
            background: BRAND.white,
            color: BRAND.night,
            fontFamily: 'Inter',
            fontWeight: 600,
            fontSize: 24,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {c.kicker}
        </span>
        <span style={{ fontSize: size, lineHeight: 1.04, letterSpacing: '-0.035em' }}>{title}</span>
        <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 32, opacity: 0.92 }}>
          {cutWords(c.subtitle, 70)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, minHeight: 92 }}>
        {c.rating ? (
          <>
            <span
              style={{
                display: 'flex',
                alignItems: 'baseline',
                padding: '10px 26px 16px',
                borderRadius: 28,
                background: gradeColor(c.rating.value),
                color: BRAND.night,
                fontSize: 64,
                transform: 'rotate(-3deg)',
              }}
            >
              {ratingText(c.rating.value)}
              <span style={{ fontSize: 30, marginLeft: 4 }}>/5</span>
            </span>
            <span
              style={{
                display: 'flex',
                alignSelf: 'center',
                marginTop: 10,
                fontFamily: 'Inter',
                fontWeight: 600,
                fontSize: 30,
              }}
            >
              {c.rating.count} avis d’étudiant·es
            </span>
          </>
        ) : (
          <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 30, opacity: 0.92 }}>
            {c.figure ?? 'Les étudiant·es racontent leur master'}
          </span>
        )}
      </div>
    </div>,
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}

/** Default share image (other pages): logo and slogan, « racontent. » highlighted in lime. */
export async function ogSite(): Promise<ImageResponse> {
  const px = 96;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 56,
        padding: '0 96px',
        background: BRAND.surface50,
        color: BRAND.night,
        fontFamily: 'Bricolage Grotesque',
        fontWeight: 800,
      }}
    >
      <Logo px={px} color={BRAND.night} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: 64,
          lineHeight: 1.08,
          letterSpacing: '-0.035em',
        }}
      >
        <span>La brochure promet,</span>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
          <span>les étudiant·es</span>
          <span
            style={{
              marginLeft: 16,
              padding: '0 12px 4px',
              borderRadius: 16,
              background: BRAND.lime,
            }}
          >
            {SLOGAN_HIGHLIGHT}
          </span>
        </div>
      </div>
    </div>,
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
