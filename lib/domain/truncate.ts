/**
 * Long labels cut in the middle, on word boundaries (breadcrumb): « Métiers de l'enseignement,
 * de l'éducation et de la formation (MEEF), 1er degré » → « Métiers de l'enseignement,…la
 * formation (MEEF), 1er degré ». The start and the end are what tells two labels apart.
 */
export function truncateMiddle(label: string, max = 58, headShare = 0.45): string {
  const text = label.trim().replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  const words = text.split(' ');
  const head: string[] = [words[0]!];
  for (let i = 1; i < words.length; i++) {
    const next = [...head, words[i]!].join(' ');
    if (next.length > max * headShare) break;
    head.push(words[i]!);
  }
  const budget = max - head.join(' ').length - 1; // 1 for the ellipsis
  const tail: string[] = [];
  for (let i = words.length - 1; i >= head.length; i--) {
    const next = [words[i]!, ...tail].join(' ');
    if (next.length > budget) break;
    tail.unshift(words[i]!);
  }
  return `${head.join(' ')}…${tail.join(' ')}`;
}
