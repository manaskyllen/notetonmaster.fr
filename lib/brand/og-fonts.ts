import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'node_modules/@fontsource');

/** Fonts for next/og ImageResponse, read from the self-hosted @fontsource packages (no network). */
export async function ogFonts() {
  const [display, sans] = await Promise.all([
    readFile(join(DIR, 'bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff')),
    readFile(join(DIR, 'inter/files/inter-latin-600-normal.woff')),
  ]);
  return [
    { name: 'Bricolage Grotesque', data: display, weight: 800 as const, style: 'normal' as const },
    { name: 'Inter', data: sans, weight: 600 as const, style: 'normal' as const },
  ];
}
