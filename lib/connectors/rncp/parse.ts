/**
 * Streaming reader of the France compétences RNCP export (XML v4.1, ~480 MB): SAX parser over
 * the zip entry, never extracted to disk nor loaded whole. Only the elements we use are kept.
 */
import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { SaxesParser } from 'saxes';
import yauzl from 'yauzl';
import { normMention } from '@/lib/data/normalize';
import { mentionTitleFromRncp } from '../monmaster-opendata/mention-names';

export interface RncpFiche {
  code: string;
  title: string; // INTITULE, as published
  mentionTitle: string; // "(fiche nationale)" removed
  mentionKey: string;
  master: boolean; // ABREGE/CODE = MASTER
  level: number | null; // NIV7 → 7
  active: boolean;
  state: string | null;
  validFrom: string | null; // ISO date
  validTo: string | null;
  lastDelivery: string | null;
  previous: string[];
  next: string[];
  certifiers: { siret: string; name: string; active: boolean }[];
  url: string | null;
}

/** Elements every fiche must have (structural check of the export, in place of a full XSD validation). */
export const REQUIRED_ELEMENTS = [
  'NUMERO_FICHE',
  'INTITULE',
  'ACTIF',
  'NOMENCLATURE_EUROPE',
] as const;

/** "06/06/2026" → "2026-06-06". */
export function frDate(v: string | undefined | null): string | null {
  const m = v?.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

interface Raw {
  values: Record<string, string>;
  lists: Record<string, Record<string, string>[]>;
  elements: Set<string>;
}

const LISTS: Record<string, string> = {
  ANCIENNE_CERTIFICATION: 'previous',
  NOUVELLE_CERTIFICATION: 'next',
  CERTIFICATEUR: 'certifiers',
};

export function toFiche(raw: Raw): RncpFiche {
  const v = raw.values;
  const title = (v.INTITULE ?? '').trim();
  const mentionTitle = mentionTitleFromRncp(title);
  const level = v['NOMENCLATURE_EUROPE/NIVEAU']?.match(/NIV(\d)/)?.[1];
  const l = (k: string) => raw.lists[k] ?? [];
  return {
    code: (v.NUMERO_FICHE ?? '').trim(),
    title,
    mentionTitle,
    mentionKey: normMention(mentionTitle),
    master: (v['ABREGE/CODE'] ?? '').trim().toUpperCase() === 'MASTER',
    level: level ? Number(level) : null,
    active: (v.ACTIF ?? '').trim().toLowerCase() === 'oui',
    state: v.ETAT_FICHE?.trim() || null,
    validFrom: frDate(v.DATE_EFFET),
    validTo: frDate(v.DATE_FIN_ENREGISTREMENT),
    lastDelivery: frDate(v.DATE_LIMITE_DELIVRANCE),
    previous: l('previous')
      .map((x) => x.ID_FICHE_ANCIENNE_CERTIFICATION?.trim())
      .filter((x): x is string => !!x),
    next: l('next')
      .map((x) => x.ID_FICHE_NOUVELLE_CERTIFICATION?.trim())
      .filter((x): x is string => !!x),
    certifiers: l('certifiers').map((x) => ({
      siret: (x.SIRET_CERTIFICATEUR ?? '').trim(),
      name: (x.NOM_CERTIFICATEUR ?? '').trim(),
      active: (x.ETAT_CERTIFICATEUR ?? 'Actif').trim().toLowerCase() === 'actif',
    })),
    url: v.LIEN_URL_DESCRIPTION?.trim() || null,
  };
}

/** Fiches of an XML stream, one by one (and the missing required elements of each). */
export async function* readFiches(
  stream: Readable,
): AsyncGenerator<{ fiche: RncpFiche; missing: string[] }> {
  const parser = new SaxesParser();
  const queue: { fiche: RncpFiche; missing: string[] }[] = [];
  const path: string[] = [];
  let raw: Raw | null = null;
  let item: { list: string; values: Record<string, string> } | null = null;
  let text = '';
  parser.on('opentag', (t) => {
    path.push(t.name);
    text = '';
    if (t.name === 'FICHE') raw = { values: {}, lists: {}, elements: new Set() };
    else if (raw && LISTS[t.name]) item = { list: LISTS[t.name]!, values: {} };
    if (raw && path.length === 3) raw.elements.add(t.name);
  });
  parser.on('text', (t) => (text += t));
  parser.on('cdata', (t) => (text += t));
  parser.on('closetag', (t) => {
    if (raw) {
      if (item && LISTS[t.name]) {
        (raw.lists[item.list] ??= []).push(item.values);
        item = null;
      } else if (item) item.values[t.name] = text;
      else if (t.name === 'FICHE') {
        const fiche = toFiche(raw);
        queue.push({ fiche, missing: REQUIRED_ELEMENTS.filter((e) => !raw!.elements.has(e)) });
        raw = null;
      } else {
        const rel = path.slice(2).join('/');
        if (rel && !(rel in raw.values)) raw.values[rel] = text;
      }
    }
    path.pop();
    text = '';
  });
  const decoder = new StringDecoder('utf8'); // a chunk may end in the middle of a character
  for await (const chunk of stream) {
    parser.write(typeof chunk === 'string' ? chunk : decoder.write(chunk as Buffer));
    while (queue.length) yield queue.shift()!;
  }
  const rest = decoder.end();
  if (rest) parser.write(rest);
  parser.close();
  while (queue.length) yield queue.shift()!;
}

/** Stream of the first XML entry of a zip file (lazy, no extraction to disk). */
export function openZipXml(zipPath: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('zip illisible'));
      zip.on('entry', (entry: yauzl.Entry) => {
        if (!/\.xml$/i.test(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) =>
          e || !stream ? reject(e ?? new Error('entrée illisible')) : resolve(stream),
        );
      });
      zip.on('end', () => reject(new Error('aucun fichier XML dans l’archive')));
      zip.readEntry();
    });
  });
}
