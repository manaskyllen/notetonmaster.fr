import { describe, expect, it } from 'vitest';
import { matchesQuery, normalize, tokenize } from '@/lib/domain/search';
import { detectNamedPerson, maskNamedPersons } from '@/lib/domain/names';
import { containsContacts, maskContacts, MASK } from '@/lib/domain/masking';
import { canTransition, requiresReason, shouldAutoHide } from '@/lib/domain/review-status';
import {
  isReviewVerified,
  masterVerificationState,
  matchUniversityDomain,
  verifiedSummary,
} from '@/lib/domain/verification';
import { can, PERMISSIONS } from '@/lib/domain/permissions';
import { formatReference, nextReference, parseReference } from '@/lib/domain/references';
import { decideFieldUpdate } from '@/lib/domain/provenance';
import { ratingSummary } from '@/lib/domain/rating';

describe('search', () => {
  it('normalises case and accents', () => {
    expect(normalize('Médiation CULTURELLE')).toBe('mediation culturelle');
    expect(tokenize('  Histoire de l’art ')).toEqual(['histoire', 'de', 'l', 'art']);
  });
  it('requires every word to be found', () => {
    const fields = ['Valorisation des nouveaux patrimoines', 'Nantes Université', 'Nantes'];
    expect(matchesQuery(fields, 'patrimoine nantes')).toBe(true);
    expect(matchesQuery(fields, 'PATRIMOINE   Nantes')).toBe(true);
    expect(matchesQuery(fields, 'patrimoine reims')).toBe(false);
    expect(matchesQuery(['Événementiel, médiation'], 'evenementiel')).toBe(true);
    expect(matchesQuery(fields, '')).toBe(true);
  });
});

describe('named person detection', () => {
  it.each([
    'Le cours de M. Dupont est inutile',
    'Mme Martin ne répond jamais',
    'avec Madame Le Gall',
    'Monsieur Petit est absent',
    'Pr Durand',
    'le Prof. Bernard',
    'la Professeure Leroy',
    'Dr Moreau',
  ])('flags "%s"', (text) => {
    expect(detectNamedPerson(text).found).toBe(true);
  });
  it.each([
    'Le cours de droit est utile',
    'Madame la directrice',
    'Mme. tout le monde',
    'M1 et M2 sont chargés',
    'Le Dr est absent',
  ])('does not flag "%s"', (text) => {
    expect(detectNamedPerson(text).found).toBe(false);
  });
  it('masks names', () => {
    expect(maskNamedPersons('Le cours de M. Dupont')).toBe('Le cours de [nom masqué]');
  });
});

describe('contact masking', () => {
  it('masks emails and French phone numbers', () => {
    const r = maskContacts(
      'Écris à prenom.nom@exemple.fr ou au 06 39 98 56 78, sinon +33639985678 ou 01.99.00.67.89',
    );
    expect(r.masked).toBe(true);
    expect(r.text).toBe(`Écris à ${MASK} ou au ${MASK}, sinon ${MASK} ou ${MASK}`);
  });
  it('leaves clean text untouched', () => {
    expect(maskContacts('Un stage de 6 mois en 2026')).toEqual({
      text: 'Un stage de 6 mois en 2026',
      masked: false,
    });
    expect(containsContacts('promo 2025')).toBe(false);
  });
});

describe('review status transitions', () => {
  it('follows the moderation workflow', () => {
    expect(canTransition('PENDING_CONFIRMATION', 'PENDING')).toBe(true);
    expect(canTransition('PENDING', 'PUBLISHED')).toBe(true);
    expect(canTransition('PENDING', 'NEEDS_EDIT')).toBe(true);
    expect(canTransition('PENDING', 'REJECTED')).toBe(true);
    expect(canTransition('PUBLISHED', 'HIDDEN')).toBe(true);
    expect(canTransition('NEEDS_EDIT', 'PENDING')).toBe(true);
    expect(canTransition('PENDING_CONFIRMATION', 'PUBLISHED')).toBe(false);
    expect(canTransition('REJECTED', 'PUBLISHED')).toBe(false);
    expect(canTransition('NEEDS_EDIT', 'PUBLISHED')).toBe(false);
  });
  it('requires a reason for every decision except publishing', () => {
    expect(requiresReason('PUBLISHED')).toBe(false);
    expect(requiresReason('REJECTED')).toBe(true);
    expect(requiresReason('NEEDS_EDIT')).toBe(true);
    expect(requiresReason('HIDDEN')).toBe(true);
  });
  it('hides after N reports in 24 h', () => {
    expect(shouldAutoHide(2, 3)).toBe(false);
    expect(shouldAutoHide(3, 3)).toBe(true);
  });
});

describe('verified badge, master by master', () => {
  it('needs an approved verification of the review’s own program', () => {
    expect(isReviewVerified('p1', [{ programId: 'p1', status: 'APPROVED' }])).toBe(true);
    // A university email for another master of the same university does not count.
    expect(
      isReviewVerified('p1', [{ programId: 'p2', status: 'APPROVED', method: 'UNIVERSITY_EMAIL' }]),
    ).toBe(false);
  });
  it('ignores pending or refused verifications', () => {
    expect(isReviewVerified('p1', [{ programId: 'p1', status: 'PENDING' }])).toBe(false);
    expect(isReviewVerified('p1', [{ programId: 'p1', status: 'REJECTED' }])).toBe(false);
  });
  it('gives the state of each master in the Vérification tab', () => {
    const now = new Date('2026-11-13T10:00:00Z');
    const later = new Date('2026-11-13T10:10:00Z');
    expect(masterVerificationState('p1', [], now)).toBe('none');
    expect(
      masterVerificationState(
        'p1',
        [{ programId: 'p1', status: 'PENDING', method: 'DOCUMENT' }],
        now,
      ),
    ).toBe('pending');
    expect(
      masterVerificationState(
        'p1',
        [{ programId: 'p1', status: 'PENDING', method: 'UNIVERSITY_EMAIL', codeExpiresAt: later }],
        now,
      ),
    ).toBe('code-sent');
    expect(
      masterVerificationState(
        'p1',
        [
          { programId: 'p1', status: 'REJECTED', method: 'DOCUMENT' },
          { programId: 'p1', status: 'APPROVED', method: 'UNIVERSITY_EMAIL' },
        ],
        now,
      ),
    ).toBe('approved');
  });
  it('summarises « N master(s) vérifié(s) sur M »', () => {
    const v = [{ programId: 'p1', status: 'APPROVED' as const }];
    expect(verifiedSummary(['p1', 'p2', 'p2'], v).label).toBe('1 master vérifié sur 2');
    expect(verifiedSummary(['p1'], v).label).toBe('Ton master est vérifié');
    expect(
      verifiedSummary(['p1', 'p3'], [...v, { programId: 'p3', status: 'APPROVED' }]).label,
    ).toBe('Tous tes masters vérifiés');
  });
  it('recognises university mail domains and subdomains', () => {
    const unis = [
      { id: 'nantes', emailDomains: ['univ-nantes.fr', 'etu.univ-nantes.fr'] },
      { id: 'saclay', emailDomains: ['universite-paris-saclay.fr', 'uvsq.fr'] },
    ];
    expect(matchUniversityDomain('a@etu.univ-nantes.fr', unis)?.id).toBe('nantes');
    expect(matchUniversityDomain('b@ens.uvsq.fr', unis)?.id).toBe('saclay');
    expect(matchUniversityDomain('c@gmail.com', unis)).toBeNull();
    expect(matchUniversityDomain('d@fake-univ-nantes.fr', unis)).toBeNull();
  });
});

describe('permissions', () => {
  it('applies the role matrix', () => {
    expect(PERMISSIONS.every((p) => p === 'connectionLogs.view' || can('ADMIN', p))).toBe(true);
    expect(can('ADMIN', 'connectionLogs.view')).toBe(false);
    expect(can('MODERATOR', 'moderation.manage')).toBe(true);
    expect(can('MODERATOR', 'data.edit')).toBe(false);
    expect(can('DATA_EDITOR', 'sync.run')).toBe(true);
    expect(can('DATA_EDITOR', 'moderation.manage')).toBe(false);
    expect(can('LEGAL', 'legal.manage')).toBe(true);
    expect(can('LEGAL', 'connectionLogs.view')).toBe(true);
    expect(can('LEGAL', 'team.manage')).toBe(false);
    for (const role of ['ADMIN', 'MODERATOR', 'DATA_EDITOR', 'LEGAL'] as const)
      expect(can(role, 'dashboard.view')).toBe(true);
  });
});

describe('references', () => {
  it('formats and increments SIG- / NOT- references', () => {
    expect(formatReference('SIG', 2026, 142)).toBe('SIG-2026-0142');
    expect(
      nextReference('SIG', 2026, [
        'SIG-2026-0141',
        'SIG-2026-0139',
        'NOT-2026-0200',
        'SIG-2025-0999',
      ]),
    ).toBe('SIG-2026-0142');
    expect(nextReference('NOT', 2027, [])).toBe('NOT-2027-0001');
    expect(parseReference('NOT-2026-0017')).toEqual({ prefix: 'NOT', year: 2026, n: 17 });
    expect(parseReference('XYZ')).toBeNull();
  });
});

describe('field locking during a sync', () => {
  const base = {
    field: 'capacity',
    value: 22,
    source: 'Mon Master',
    state: 'OK' as const,
    locked: false,
  };
  it('never overwrites a locked field', () => {
    expect(
      decideFieldUpdate(
        { ...base, locked: true },
        { field: 'capacity', value: 30, source: 'Mon Master' },
      ).action,
    ).toBe('skip-locked');
  });
  it('updates from the same source and creates missing fields', () => {
    expect(
      decideFieldUpdate(base, { field: 'capacity', value: 23, source: 'Mon Master' }).action,
    ).toBe('update');
    expect(
      decideFieldUpdate(undefined, { field: 'capacity', value: 23, source: 'Mon Master' }).action,
    ).toBe('create');
    expect(
      decideFieldUpdate(base, { field: 'capacity', value: 22, source: 'Mon Master' }).action,
    ).toBe('unchanged');
  });
  it('raises a conflict when another source disagrees', () => {
    expect(
      decideFieldUpdate(base, { field: 'capacity', value: 24, source: 'Site université' }),
    ).toMatchObject({ action: 'conflict', current: 22, incoming: 24 });
  });
});

describe('ratings', () => {
  it('always comes with the number of reviews', () => {
    expect(ratingSummary([4, 4, 5]).label).toBe('4,3 · 3 avis');
    expect(ratingSummary([]).label).toBe('Aucun avis');
  });
});
