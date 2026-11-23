import 'server-only';
import { crc32, deflateSync } from 'node:zlib';
import qrcode from 'qrcode-generator';

/**
 * QR codes of the short links (issue #17), drawn on the server: error correction M, a quiet zone
 * of 4 modules (the minimum of the standard). SVG for the printer (vector), PNG as an option.
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

/** One path of horizontal runs, black on white, crisp at any size. */
export function qrSvg(text: string, opts: { title?: string } = {}): string {
  const m = qrMatrix(text);
  const size = m.length + 2 * QR_MARGIN;
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
  const title = opts.title ? `<title>${escapeXml(opts.title)}</title>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 10}" height="${size * 10}" shape-rendering="crispEdges">` +
    `${title}<rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
  );
}

/** Grey-level PNG, `scale` pixels per module. */
export function qrPng(text: string, scale = 16): Buffer {
  const m = qrMatrix(text);
  const size = (m.length + 2 * QR_MARGIN) * scale;
  // One filter byte (0) then one byte per pixel, per line.
  const raw = Buffer.alloc((size + 1) * size, 0xff);
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0;
    const r = Math.floor(y / scale) - QR_MARGIN;
    if (r < 0 || r >= m.length) continue;
    for (let x = 0; x < size; x++) {
      const c = Math.floor(x / scale) - QR_MARGIN;
      if (c >= 0 && c < m.length && m[r]![c]) raw[y * (size + 1) + 1 + x] = 0;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
