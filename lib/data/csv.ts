/** Streaming CSV reader (csv-parse): the national files are read row by row, never loaded whole. */
import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';

export interface CsvOptions {
  delimiter?: string;
  /** Called once with the header (BOM removed) before the first row. */
  onHeader?: (columns: string[]) => void | Promise<void>;
}

export async function* readCsv(
  path: string,
  opts: CsvOptions = {},
): AsyncGenerator<Record<string, string>> {
  let header: string[] | null = null;
  const parser = createReadStream(path).pipe(
    parse({
      delimiter: opts.delimiter ?? ';',
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      columns: (h: string[]) => {
        header = h.map((c) => c.replace(/^﻿/, '').trim());
        return header;
      },
    }),
  );
  let announced = false;
  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    if (!announced && header) {
      announced = true;
      await opts.onHeader?.(header);
    }
    yield row;
  }
  if (!announced && header) await opts.onHeader?.(header);
}
