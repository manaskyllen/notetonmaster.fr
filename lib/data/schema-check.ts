/**
 * Compares the columns of a downloaded file with the schema recorded in fixtures/schemas/<key>.json.
 * A missing required column blocks the run before any write; a new column is a warning (and,
 * for Mon Master, an information alert: new columns such as "attendus" could be plugged).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ExpectedColumn {
  name: string;
  required?: boolean;
}

export interface SchemaDiff {
  missingRequired: string[];
  missingOptional: string[];
  added: string[];
}

export function compareColumns(expected: ExpectedColumn[], actual: string[]): SchemaDiff {
  const act = new Set(actual.map((c) => c.replace(/^﻿/, '').trim()));
  const exp = new Set(expected.map((c) => c.name));
  return {
    missingRequired: expected.filter((c) => c.required && !act.has(c.name)).map((c) => c.name),
    missingOptional: expected.filter((c) => !c.required && !act.has(c.name)).map((c) => c.name),
    added: [...act].filter((c) => !exp.has(c)),
  };
}

/** Columns of one dataset in fixtures/schemas/<sourceKey>.json. */
export function expectedColumns(sourceKey: string, dataset: string): ExpectedColumn[] {
  const file = JSON.parse(
    readFileSync(join(process.cwd(), 'fixtures/schemas', `${sourceKey}.json`), 'utf8'),
  ) as { datasets?: Record<string, { columns?: ExpectedColumn[] }> };
  const cols = file.datasets?.[dataset]?.columns;
  if (!cols) throw new Error(`Schéma inconnu : ${sourceKey}/${dataset}`);
  return cols.map((c) => ({ name: c.name, required: !!c.required }));
}
