import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { randomToken } from '@/lib/crypto';
import { DOCUMENT_MAX_BYTES } from '@/lib/domain/verification';

export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/data/uploads';

/** Proofs of study: JPEG, PNG or PDF (WebP and HEIC refused, their metadata is not stripped). */
export const DOCUMENT_REFUSED =
  'Envoie ta photo en JPEG ou en PNG, ou un PDF. Sur iPhone, choisis-la depuis ta galerie : elle est convertie automatiquement.';

/** Detects the real type from magic bytes (never trust the extension or the browser type). */
export function sniffMime(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-')
    return { mime: 'application/pdf', ext: 'pdf' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return { mime: 'image/png', ext: 'png' };
  return null;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * JPEG without its metadata segments: APP1 (EXIF, XMP: GPS position, device, author), APP3 to
 * APP13, APP15 and comments. APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe colour
 * transform) are kept: the image would not display the same without them. Null when malformed.
 */
function stripJpeg(buf: Buffer): Buffer | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === undefined) return null;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd9) return Buffer.concat([...out, buf.subarray(i, i + 2)]); // EOI
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > buf.length) return null;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null;
    if (marker === 0xda) return Buffer.concat([...out, buf.subarray(i)]); // SOS: image data to the end
    const drop =
      marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xef || marker === 0xfe;
    if (!drop) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}

/** PNG without text (tEXt, zTXt, iTXt), EXIF (eXIf) and time (tIME) chunks. Null when malformed. */
function stripPng(buf: Buffer): Buffer | null {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const out: Buffer[] = [PNG_SIGNATURE];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const end = i + 12 + len;
    if (end > buf.length) return null;
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    if (!['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(out);
  }
  return null;
}

/** The file without its metadata (JPEG, PNG), or null when it cannot be read safely. */
export function stripMetadata(buf: Buffer, mime: string): Buffer | null {
  if (mime === 'image/jpeg') return stripJpeg(buf);
  if (mime === 'image/png') return stripPng(buf);
  return buf;
}

export type SaveResult = { ok: true; path: string; mime: string } | { ok: false; error: string };

/** Stores a verification document under a random name in the private uploads volume. */
export async function saveDocument(file: File): Promise<SaveResult> {
  if (!file || file.size === 0) return { ok: false, error: 'Choisis un fichier.' };
  if (file.size > DOCUMENT_MAX_BYTES)
    return { ok: false, error: 'Fichier trop lourd (10 Mo maximum).' };
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffMime(buf);
  if (!type) return { ok: false, error: DOCUMENT_REFUSED };
  const clean = stripMetadata(buf, type.mime);
  if (!clean) return { ok: false, error: DOCUMENT_REFUSED };
  await mkdir(UPLOADS_DIR, { recursive: true });
  const name = `${randomToken(16)}.${type.ext}`;
  await writeFile(join(UPLOADS_DIR, name), clean, { mode: 0o600 });
  return { ok: true, path: name, mime: type.mime };
}

/** Deletes a stored document (as soon as a decision is taken). */
export async function deleteDocument(path: string | null | undefined) {
  if (!path) return;
  try {
    await unlink(join(UPLOADS_DIR, basename(path)));
  } catch {
    /* already gone */
  }
}

export function documentFullPath(path: string) {
  return join(UPLOADS_DIR, basename(path));
}
