/** Per-university chip colors (by position), in Explorer and Comparer. */
const UNI_TONES = [
  'bg-violet-100 text-violet-700',
  'bg-coral-100 text-coral-800',
  'bg-lime-100 text-lime-800',
] as const;

export function uniTone(position: number): string {
  return UNI_TONES[position % UNI_TONES.length]!;
}

/** Same tone for an establishment on every card (stable hash of its id). */
export function uniToneOf(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return uniTone(Math.abs(h));
}

export const MODALITY_LABEL = {
  ONSITE: 'Présentiel',
  WORK_STUDY: 'Alternance',
  HYBRID: 'Hybride',
  REMOTE: 'À distance',
} as const;
