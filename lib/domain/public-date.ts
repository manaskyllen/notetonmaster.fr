/**
 * Dates shown publicly (reviews, replies, questions, answers) are rounded to the month: an exact
 * time could be matched against someone's known activity (a login, a mail sent). The real date
 * stays in the database for moderation and sorting.
 */
export function publicMonth(d: Date | null | undefined): Date {
  if (!d) return new Date(0);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
