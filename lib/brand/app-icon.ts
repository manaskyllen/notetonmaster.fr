/**
 * Brand assets as standalone SVG strings with fixed colors (light theme values), for contexts
 * without CSS variables or web fonts: favicons, apple-icon, OG image.
 */
import { M_GLYPH_PATH } from './paths.generated';

export const BRAND = {
  night: '#16131f',
  lime: '#d4f75a',
  violet: '#5a3bf0',
  coral: '#ffb59e',
  surface50: '#f5f4f8',
  inkMuted: '#5e5a6b',
  white: '#ffffff',
} as const;

/** App icon SVG: "m" on a lime square (tilted) or, for 16px, a night square without rotation. */
export function appIconSvg(size: number, dark = false): string {
  if (dark)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" rx="25" fill="${BRAND.night}"/><path d="${M_GLYPH_PATH}" fill="${BRAND.lime}" transform="translate(50 50) scale(1.15) translate(-50 -50)"/></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><g transform="rotate(-3 50 50)"><rect x="6" y="6" width="88" height="88" rx="24" fill="${BRAND.lime}"/><path d="${M_GLYPH_PATH}" fill="${BRAND.night}"/></g></svg>`;
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
