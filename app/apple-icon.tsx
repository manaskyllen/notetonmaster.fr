import { ImageResponse } from 'next/og';
import { appIconSvg, BRAND, svgDataUri } from '@/lib/brand/app-icon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: BRAND.night }}>
      <img src={svgDataUri(appIconSvg(180))} width={180} height={180} alt="" />
    </div>,
    size,
  );
}
