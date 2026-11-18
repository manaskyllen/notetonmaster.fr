import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { appIconSvg, svgDataUri } from '@/lib/brand/app-icon';

/** PNG app icons: /icons/icon-16.png (dark favicon), /icons/icon-192.png, /icons/icon-512.png. */
const FILES: Record<string, { size: number; dark: boolean }> = {
  'icon-16.png': { size: 16, dark: true },
  'icon-32.png': { size: 32, dark: true },
  'icon-192.png': { size: 192, dark: false },
  'icon-512.png': { size: 512, dark: false },
};

export const dynamic = 'force-static';

export function generateStaticParams() {
  return Object.keys(FILES).map((file) => ({ file }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const spec = FILES[file];
  if (!spec) notFound();
  const { size, dark } = spec;
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={svgDataUri(appIconSvg(size, dark))} width={size} height={size} alt="" />,
    { width: size, height: size },
  );
}
