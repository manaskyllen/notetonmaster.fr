'use client';

import { useMemo } from 'react';
import { QR_COPY, type ShareTab } from '@/lib/domain/share-copy';
import { QR_MARGIN, qrMatrix, qrPath } from '@/lib/qr/matrix';

/**
 * « QR code » of « Partager »: the link of the selected tab, error correction M, black on white,
 * drawn in the browser (same generator as the short links of issue #17, no external service).
 * Its own chunk: fetched on the first click on « QR code » only.
 */
export function ShareQr({ id, tab, url }: { id: string; tab: ShareTab; url: string }) {
  const m = useMemo(() => qrMatrix(url), [url]);
  const size = m.length + 2 * QR_MARGIN;
  const copy = QR_COPY[tab];
  return (
    <div id={id} className="flex items-center gap-3.5 rounded-[16px] bg-night p-3 text-on-night">
      <div className="flex-none rounded-[12px] bg-white p-1.5 leading-none">
        <svg
          role="img"
          aria-label={copy.label}
          data-qr-url={url}
          width="120"
          height="120"
          viewBox={`0 0 ${size} ${size}`}
          shapeRendering="crispEdges"
          className="block"
        >
          <rect width={size} height={size} fill="#FFFFFF" />
          <path d={qrPath(m)} fill="#16131F" />
        </svg>
      </div>
      <span className="min-w-0 text-[14px] leading-[1.45] text-on-night-muted">{copy.text}</span>
    </div>
  );
}
