/**
 * Droit de réponse (feature 5): is an address an official address of the establishment of a
 * parcours? Pure, shared by the live hint under the field and the server check.
 */

/** Sub-domains of student mailboxes, refused even under an official domain. */
const STUDENT = /^(etu|etud|etudiant|etudiants|student|students)$/i;
const VALIDITY_MONTHS = 12;
export const STAFF_VALIDITY_MS = VALIDITY_MONTHS * 30.44 * 24 * 3600_000;

export type DomainCheck =
  { ok: true; domain: string } | { ok: false; reason: 'format' | 'student' | 'other' };

export function hostOf(email: string): string | null {
  const m = /^[^\s@]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i.exec(email.trim());
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * The address belongs to one of `domains` (the domain itself or a sub-domain of it, e.g. a
 * laboratory), and is not a student mailbox (« etu.univ-nantes.fr »).
 */
export function checkStaffEmail(email: string, domains: string[]): DomainCheck {
  const host = hostOf(email);
  if (!host) return { ok: false, reason: 'format' };
  const match = domains
    .map((d) => d.toLowerCase().replace(/^@/, ''))
    .filter((d) => host === d || host.endsWith(`.${d}`))
    .sort((a, b) => b.length - a.length)[0];
  if (!match) return { ok: false, reason: 'other' };
  const sub = host === match ? [] : host.slice(0, -match.length - 1).split('.');
  if (sub.some((label) => STUDENT.test(label))) return { ok: false, reason: 'student' };
  return { ok: true, domain: match };
}

/** The message under the field, as you type. */
export function domainHint(
  email: string,
  domains: string[],
  universityName: string,
): { text: string; tone: 'muted' | 'ok' | 'error' } {
  const typed = email.trim().length > 3 && email.indexOf('@') > 0;
  if (!typed)
    return {
      text: `Seules les adresses du domaine de l’établissement (${domains.join(', ') || 'à renseigner'}) sont acceptées.`,
      tone: 'muted',
    };
  const c = checkStaffEmail(email, domains);
  if (c.ok) return { text: `Domaine reconnu : ${universityName}.`, tone: 'ok' };
  if (c.reason === 'student')
    return {
      text: 'Les adresses étudiantes ne sont pas acceptées : utilisez votre adresse professionnelle.',
      tone: 'error',
    };
  if (c.reason === 'format') return { text: 'Adresse incomplète.', tone: 'muted' };
  return { text: 'Ce domaine ne correspond pas à l’établissement de ce parcours.', tone: 'error' };
}

export function staffStillVerified(verifiedAt: Date | null, now = new Date()): boolean {
  return !!verifiedAt && now.getTime() - verifiedAt.getTime() < STAFF_VALIDITY_MS;
}

/** A reply of the teaching team: 1 500 characters at most. */
export const RESPONSE_MAX = 1500;
