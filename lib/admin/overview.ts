import type { AdminRole } from '@/lib/db/generated/enums';
import { can, type Permission } from '@/lib/domain/permissions';
import type { AdminCounts } from './counts';
import { issueTotal } from './counts';
import { oldProgramThreshold } from './issues';

/**
 * « À traiter » of the overview: one row per subject (not per item), sorted by urgency then by
 * number. A subject with nothing left disappears; each role only sees its subjects (Modération
 * does not see the data ones).
 */
export type Urgency = 'block' | 'high' | 'low';
export type SubjectIcon = 'legal' | 'mod' | 'err' | 'conflict' | 'prog' | 'old' | 'cms' | 'id';

export interface Subject {
  key: string;
  urgency: Urgency;
  n: number;
  title: string;
  detail: string;
  role: 'Légal' | 'Modération' | 'Données';
  cta: string;
  href: string;
  icon: SubjectIcon;
}

const ROLE_PERMISSION: Record<Subject['role'], Permission> = {
  Légal: 'legal.manage',
  Modération: 'moderation.manage',
  Données: 'data.edit',
};

export const URGENCY_ORDER: Record<Urgency, number> = { block: 0, high: 1, low: 2 };

const nf = new Intl.NumberFormat('fr-FR');
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);
const list = (names: string[], total: number) =>
  names.join(', ') +
  (total > names.length
    ? ` et ${total - names.length} autre${total - names.length > 1 ? 's' : ''}`
    : '');

export function buildSubjects(c: AdminCounts, role: AdminRole): Subject[] {
  const out: Subject[] = [];
  const m = c.moderation;

  if (m.legal > 0)
    out.push({
      key: 'legal',
      urgency: 'block',
      n: m.legal,
      title: plural(m.legal, 'demande légale à traiter', 'demandes légales à traiter'),
      detail:
        c.legalDeadlineDays == null
          ? 'Retrait de contenu ou réquisition'
          : c.legalDeadlineDays < 0
            ? `Délai interne dépassé de ${-c.legalDeadlineDays} jour${c.legalDeadlineDays < -1 ? 's' : ''}`
            : `Délai de réponse le plus proche : ${c.legalDeadlineDays} jour${c.legalDeadlineDays > 1 ? 's' : ''}`,
      role: 'Légal',
      cta: 'Répondre',
      href: '/admin/moderation?file=legal',
      icon: 'legal',
    });

  const errors = c.collectErrors.total;
  if (errors > 0)
    out.push({
      key: 'collect',
      urgency: 'block',
      n: errors,
      title: plural(errors, 'collecte en erreur', 'collectes en erreur'),
      detail: list(
        [...c.collectErrors.sources, ...c.collectErrors.universities].slice(0, 3),
        errors,
      ),
      role: 'Données',
      cta: 'Voir',
      href: '/admin/recuperation',
      icon: 'err',
    });

  const toModerate = m.total - m.legal;
  if (toModerate > 0)
    out.push({
      key: 'moderation',
      urgency: 'high',
      n: toModerate,
      title:
        toModerate === m.reviews
          ? plural(toModerate, 'avis à modérer', 'avis à modérer')
          : plural(toModerate, 'élément à modérer', 'éléments à modérer'),
      detail:
        c.oldestReviewHours != null
          ? `Le plus ancien avis attend depuis ${c.oldestReviewHours} h (délai annoncé : 48 h)`
          : [
              m.reviews && `${m.reviews} avis`,
              m.reports && `${m.reports} signalements`,
              m.documents && `${m.documents} justificatifs`,
              m.questions && `${m.questions} questions`,
              m.responses && `${m.responses} réponses`,
            ]
              .filter(Boolean)
              .join(' · '),
      role: 'Modération',
      cta: 'Modérer',
      href: '/admin/moderation',
      icon: 'mod',
    });

  const conflicts = issueTotal(c, 'CONFLICT', { published: true });
  if (conflicts > 0)
    out.push({
      key: 'conflicts',
      urgency: 'high',
      n: conflicts,
      title: plural(
        conflicts,
        'conflit de données sur une fiche publiée',
        'conflits de données sur des fiches publiées',
      ),
      detail: c.conflictGroups.groups
        ? `Regroupés en ${c.conflictGroups.groups} règle${c.conflictGroups.groups > 1 ? 's' : ''} : ${c.conflictGroups.fields.join(', ')}`
        : 'À arbitrer dans chaque fiche',
      role: 'Données',
      cta: 'Arbitrer',
      href: '/admin/fiches?vue=conflits',
      icon: 'conflict',
    });

  const noProgram = issueTotal(c, 'NO_PROGRAM', { published: true });
  if (noProgram > 0)
    out.push({
      key: 'no-program',
      urgency: 'low',
      n: noProgram,
      title: plural(noProgram, 'fiche publiée sans programme', 'fiches publiées sans programme'),
      detail: c.noProgramByCity.map((x) => `${x.city} ${nf.format(x.n)}`).join(' · '),
      role: 'Données',
      cta: 'Voir les fiches',
      href: '/admin/fiches?vue=sans-programme',
      icon: 'prog',
    });

  const old = issueTotal(c, 'OLD_PROGRAM', { published: true });
  if (old > 0) {
    const y = oldProgramThreshold() - 1;
    out.push({
      key: 'old-program',
      urgency: 'low',
      n: old,
      title: plural(old, 'programme de plus de 2 ans', 'programmes de plus de 2 ans'),
      detail: `Livrets ${y}-${y + 1} ou plus anciens`,
      role: 'Données',
      cta: 'Voir les fiches',
      href: '/admin/fiches?vue=programme-ancien',
      icon: 'old',
    });
  }

  if (c.noProfile.n > 0)
    out.push({
      key: 'no-profile',
      urgency: 'low',
      n: c.noProfile.n,
      title: plural(
        c.noProfile.n,
        'établissement sans profil de collecte',
        'établissements sans profil de collecte',
      ),
      detail: list(c.noProfile.names, c.noProfile.n),
      role: 'Données',
      cta: 'Configurer',
      href: '/admin/recuperation#sans-profil',
      icon: 'cms',
    });

  const noUai = issueTotal(c, 'NO_UAI', { published: true });
  if (noUai > 0)
    out.push({
      key: 'no-uai',
      urgency: 'low',
      n: noUai,
      title: plural(noUai, 'fiche sans code UAI', 'fiches sans code UAI'),
      detail: 'Établissement à rattacher à l’annuaire',
      role: 'Données',
      cta: 'Voir les fiches',
      href: '/admin/fiches?vue=sans-uai',
      icon: 'id',
    });

  return out
    .filter((s) => can(role, ROLE_PERMISSION[s.role]))
    .sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || b.n - a.n);
}
