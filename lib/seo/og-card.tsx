import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/brand/app-icon';
import { HOME_HEADLINE } from '@/lib/brand/copy';
import { ogFonts } from '@/lib/brand/og-fonts';
import { gradeColor } from '@/lib/domain/rating';
import { cutWords, ratingText } from './titles';

export const OG_SIZE = { width: 1200, height: 630 };

/** The logo: « note ton » and « master » on a lime block tilted by −3°. */
function Logo({ px, color, tag = BRAND.lime }: { px: number; color: string; tag?: string }) {
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
          background: tag,
          color: tag === BRAND.lime ? BRAND.night : BRAND.lime,
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
  /** lime: the review form set on a parcours (night text, night « master » label). */
  tone: 'violet' | 'night' | 'lime';
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
  const bg = c.tone === 'violet' ? BRAND.violet : c.tone === 'lime' ? BRAND.lime : BRAND.night;
  const fg = c.tone === 'lime' ? BRAND.night : BRAND.white;
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
        color: fg,
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
          background:
            c.tone === 'night' ? BRAND.violet : c.tone === 'lime' ? BRAND.violet : BRAND.lime,
          opacity: 0.9,
        }}
      />
      <Logo px={44} color={fg} tag={c.tone === 'lime' ? BRAND.night : BRAND.lime} />
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

/**
 * Default share image (home and pages without their own): logo and the home headline, set like
 * its h1: two lines, « combien ? » on a lime label tilted by −2°, the comma given its own room.
 */
export async function ogSite(): Promise<ImageResponse> {
  const px = 96;
  const fs = 104;
  const [before, ...after] = HOME_HEADLINE.line1.split(',');
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
          fontSize: fs,
          lineHeight: 0.94,
          letterSpacing: '-0.045em',
        }}
      >
        <div style={{ display: 'flex', whiteSpace: 'pre' }}>
          <span>{before}</span>
          {after.length > 0 && <span style={{ letterSpacing: 0, marginLeft: fs * 0.03 }}>,</span>}
          <span>{after.join(',')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', whiteSpace: 'pre' }}>
          <span>{`${HOME_HEADLINE.line2} `}</span>
          <span
            style={{
              padding: `0 ${fs * 0.12}px ${fs * 0.06}px`,
              borderRadius: fs * 0.14,
              background: BRAND.lime,
              transform: 'rotate(-2deg)',
            }}
          >
            {HOME_HEADLINE.highlight}
          </span>
        </div>
      </div>
    </div>,
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
