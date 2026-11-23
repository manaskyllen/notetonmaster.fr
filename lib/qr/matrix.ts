import qrcode from 'qrcode-generator';

/**
 * QR code modules, shared by the server (lib/qr/render.ts, short links of issue #17) and the
 * browser (« QR code » of « Partager », loaded on click only). Error correction M, a quiet zone
 * of 4 modules (the minimum of the standard).
 */
export const QR_MARGIN = 4;

/** Dark modules of the code of `text` (rows of columns). */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** One SVG path of horizontal runs, offset by the quiet zone: crisp at any size. */
export function qrPath(m: boolean[][]): string {
  let d = '';
  m.forEach((row, r) => {
    for (let c = 0; c < row.length;) {
      if (!row[c]) {
        c++;
        continue;
      }
      let end = c;
      while (end < row.length && row[end]) end++;
      d += `M${c + QR_MARGIN} ${r + QR_MARGIN}h${end - c}v1h-${end - c}z`;
      c = end;
    }
  });
  return d;
}
