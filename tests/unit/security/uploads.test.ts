/**
 * Proofs of study: JPEG, PNG or PDF only, checked on the real content; JPEG EXIF / XMP and PNG
 * text and EXIF chunks are removed before the file is written.
 */
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'nm-uploads-'));
process.env.UPLOADS_DIR = dir;
const { saveDocument, sniffMime, stripMetadata } = await import('@/lib/uploads');

const REFUSED =
  'Envoie ta photo en JPEG ou en PNG, ou un PDF. Sur iPhone, choisis-la depuis ta galerie : elle est convertie automatiquement.';

function segment(marker: number, payload: Buffer) {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
}

/** A minimal JPEG: SOI, APP0 JFIF, APP1 Exif with GPS, COM, SOS + data, EOI. */
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
  segment(
    0xe1,
    Buffer.from('Exif\0\0GPSLatitude=47.2184;GPSLongitude=-1.5536;Model=iPhone', 'latin1'),
  ),
  segment(
    0xe1,
    Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Jean Dupont</x:xmpmeta>', 'latin1'),
  ),
  segment(0xfe, Buffer.from('Jean Dupont', 'latin1')),
  segment(0xda, Buffer.from([0x00, 0x01, 0x02])),
  Buffer.from([0x11, 0x22, 0x33, 0xff, 0x00, 0x44]),
  Buffer.from([0xff, 0xd9]),
]);

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('tEXt', Buffer.from('Author\0Jean Dupont', 'latin1')),
  chunk('iTXt', Buffer.from('Comment\0\0\0\0\0Jean', 'latin1')),
  chunk('eXIf', Buffer.from('MM\0*GPS', 'latin1')),
  chunk('tIME', Buffer.from([7, 234, 11, 16, 15, 57, 29])),
  chunk('IDAT', deflateSync(Buffer.from([0, 0]))),
  chunk('IEND', Buffer.alloc(0)),
]);

const file = (buf: Buffer, name: string, type = '') =>
  new File([new Uint8Array(buf)], name, { type });

describe('accepted formats', () => {
  it('JPEG, PNG and PDF are recognised on their content', () => {
    expect(sniffMime(jpeg)?.mime).toBe('image/jpeg');
    expect(sniffMime(png)?.mime).toBe('image/png');
    expect(sniffMime(Buffer.from('%PDF-1.7\n'))?.mime).toBe('application/pdf');
  });

  it('WebP and HEIC are refused, with the message for iPhone users', async () => {
    const webp = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'), Buffer.alloc(20)]);
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypheic', 'latin1'),
      Buffer.alloc(20),
    ]);
    for (const b of [webp, heic]) {
      expect(sniffMime(b)).toBeNull();
      expect(await saveDocument(file(b, 'photo.jpg', 'image/jpeg'))).toEqual({
        ok: false,
        error: REFUSED,
      });
    }
  });

  it('the extension and the type sent by the browser do not count', async () => {
    const r = await saveDocument(
      file(Buffer.from('<script>alert(1)</script>'), 'a.pdf', 'application/pdf'),
    );
    expect(r).toEqual({ ok: false, error: REFUSED });
  });
});

describe('metadata removed before storage', () => {
  beforeAll(() => {
    for (const f of readdirSync(dir)) void f;
  });

  it('JPEG: EXIF, XMP and comments removed, image data kept', async () => {
    const r = await saveDocument(file(jpeg, 'carte.jpg'));
    expect(r.ok).toBe(true);
    const out = readFileSync(join(dir, (r as { path: string }).path));
    const text = out.toString('latin1');
    for (const s of ['Exif', 'GPS', 'iPhone', 'xmpmeta', 'Jean Dupont'])
      expect(text).not.toContain(s);
    expect(text).toContain('JFIF');
    expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(out.includes(Buffer.from([0x11, 0x22, 0x33, 0xff, 0x00, 0x44]))).toBe(true);
  });

  it('PNG: text, EXIF and time chunks removed, image chunks kept', async () => {
    const r = await saveDocument(file(png, 'carte.png'));
    expect(r.ok).toBe(true);
    const out = readFileSync(join(dir, (r as { path: string }).path)).toString('latin1');
    for (const s of ['tEXt', 'iTXt', 'eXIf', 'tIME', 'Jean Dupont', 'GPS'])
      expect(out).not.toContain(s);
    for (const s of ['IHDR', 'IDAT', 'IEND']) expect(out).toContain(s);
  });

  it('a truncated JPEG is refused rather than stored as is', () => {
    expect(stripMetadata(jpeg.subarray(0, 30), 'image/jpeg')).toBeNull();
  });
});
