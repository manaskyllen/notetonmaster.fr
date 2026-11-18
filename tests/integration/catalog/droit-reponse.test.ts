/** Droit de réponse (feature 5): official domains, one reply per review, re-moderation, notice. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encrypt } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { checkStaffEmail, domainHint, staffStillVerified } from '@/lib/domain/staff-domains';
import { decideReviewResponse, saveResponse } from '@/lib/responses';
import { FX } from '../fixtures/ids';
import { fixtureAdmin, programBySlug, universityBySlug } from '../fixtures/lookup';

describe('official domains of the establishment', () => {
  const nantes = ['univ-nantes.fr'];
  it('accepts the domain and its staff sub-domains', () => {
    expect(checkStaffEmail('prenom.nom@univ-nantes.fr', nantes)).toEqual({
      ok: true,
      domain: 'univ-nantes.fr',
    });
    expect(checkStaffEmail('Prenom.Nom@LS2N.univ-nantes.fr', nantes)).toEqual({
      ok: true,
      domain: 'univ-nantes.fr',
    });
  });
  it('refuses student sub-domains, other domains and look-alikes', () => {
    expect(checkStaffEmail('demo.fictif@etu.univ-nantes.fr', nantes)).toEqual({
      ok: false,
      reason: 'student',
    });
    expect(checkStaffEmail('demo.fictif@etudiant.univ-nantes.fr', nantes)).toEqual({
      ok: false,
      reason: 'student',
    });
    expect(checkStaffEmail('demo.fictif@etud.univ-nantes.fr', nantes)).toEqual({
      ok: false,
      reason: 'student',
    });
    expect(checkStaffEmail('x@gmail.com', nantes)).toEqual({ ok: false, reason: 'other' });
    expect(checkStaffEmail('x@univ-nantes.fr.evil.com', nantes)).toEqual({
      ok: false,
      reason: 'other',
    });
    expect(checkStaffEmail('x@fakeuniv-nantes.fr', nantes)).toEqual({ ok: false, reason: 'other' });
    expect(checkStaffEmail('pas-une-adresse', nantes)).toEqual({ ok: false, reason: 'format' });
  });
  it('tells at once whether the domain is recognised', () => {
    expect(domainHint('m.d@univ-nantes.fr', nantes, 'Nantes Université')).toEqual({
      text: 'Domaine reconnu : Nantes Université.',
      tone: 'ok',
    });
    expect(domainHint('a@etu.univ-nantes.fr', nantes, 'Nantes Université').tone).toBe('error');
    expect(domainHint('m.d@gmail.com', nantes, 'Nantes Université').text).toBe(
      'Ce domaine ne correspond pas à l’établissement de ce parcours.',
    );
  });
  it('the verification lasts 12 months', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    expect(staffStillVerified(new Date('2026-01-01T00:00:00Z'), now)).toBe(true);
    expect(staffStillVerified(new Date('2025-11-01T00:00:00Z'), now)).toBe(false);
    expect(staffStillVerified(null, now)).toBe(false);
  });
  it('the database has the official domain of Nantes, not its student one', async () => {
    const u = await universityBySlug(FX.universities.nantes);
    expect(u.mailDomains).toContain('univ-nantes.fr');
    expect(u.mailDomains).not.toContain('etu.univ-nantes.fr');
  });
});

describe('replies (database)', () => {
  const tag = randomUUID().slice(0, 8);
  let reviewId = '';
  let nantesId = '';
  const responders: Record<'a' | 'b' | 'other', { id: string; universityIds: string[] }> =
    {} as never;
  let admin = { id: '', name: '' };

  const reviewIds: string[] = [];
  let programId = '';
  /** A new published review for each test: no test depends on the reply of another one. */
  beforeEach(async () => {
    const n = reviewIds.length;
    reviewId = (
      await prisma.review.create({
        data: {
          ref: `avis-${tag.slice(0, 4)}${String(n).padStart(2, '0')}`,
          programId,
          authorEmailHash: `test:${tag}:${n}`,
          contactEmailEnc: encrypt(`auteur.${tag}@test.notetonmaster.local`),
          level: 'M2',
          cohortYear: 2025,
          overallRating: 2,
          pros: 'Des intervenant·es du métier tout au long de l’année.',
          cons: 'Le voyage d’étude a été remplacé par deux sorties.',
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      })
    ).id;
    reviewIds.push(reviewId);
  });

  beforeAll(async () => {
    const program = await programBySlug(FX.programs.vnp);
    programId = program.id;
    nantesId = program.universityId;
    const other = await universityBySlug(FX.universities.strasbourg);
    for (const [k, uni] of [
      ['a', nantesId],
      ['b', nantesId],
      ['other', other.id],
    ] as const) {
      const r = await prisma.staffResponder.create({
        data: {
          emailHash: `test:${tag}:${k}`,
          universityId: uni,
          domain: 'univ-nantes.fr',
          verifiedAt: new Date(),
        },
      });
      responders[k] = { id: r.id, universityIds: [uni] };
    }
    const a = await fixtureAdmin();
    admin = { id: a.id, name: a.name };
  });
  afterAll(async () => {
    await prisma.review.deleteMany({ where: { id: { in: reviewIds } } });
    await prisma.staffResponder.deleteMany({ where: { emailHash: { startsWith: `test:${tag}` } } });
    await prisma.$disconnect();
  });

  it('only the establishment of the parcours can reply', async () => {
    expect(
      await saveResponse(
        responders.other,
        reviewId,
        'Une réponse d’un autre établissement, refusée.',
      ),
    ).toEqual({
      ok: false,
      error: 'Cet avis ne concerne pas un parcours de votre établissement.',
    });
  });

  it('one reply per review; contact details masked', async () => {
    const r = await saveResponse(
      responders.a,
      reviewId,
      'Merci pour ce retour. Écrivez-nous à scol@univ-nantes.fr pour en parler.',
    );
    expect(r).toMatchObject({ ok: true, status: 'PENDING' });
    const row = await prisma.reviewResponse.findUniqueOrThrow({ where: { reviewId } });
    expect(row.body).toContain('[coordonnées masquées]');
    expect(row.hadMaskedContent).toBe(true);
    expect(
      await saveResponse(
        responders.b,
        reviewId,
        'Une deuxième réponse de la même équipe, refusée.',
      ),
    ).toEqual({
      ok: false,
      error: 'Une réponse a déjà été déposée sous cet avis : une seule par avis.',
    });
  });

  it('publication tells the author; an edit goes back to moderation', async () => {
    await saveResponse(responders.a, reviewId, 'Merci pour ce retour, nous en parlons en conseil.');
    const row = await prisma.reviewResponse.findUniqueOrThrow({ where: { reviewId } });
    const pub = await decideReviewResponse(admin, row.id, 'publish', '');
    expect(pub).toMatchObject({ ok: true, notified: true });
    expect(await prisma.reviewResponse.findUniqueOrThrow({ where: { reviewId } })).toMatchObject({
      status: 'PUBLISHED',
    });
    expect(await decideReviewResponse(admin, row.id, 'publish', '')).toEqual({
      ok: false,
      error: 'Réponse déjà traitée.',
    });

    await saveResponse(
      responders.a,
      reviewId,
      'Merci pour ce retour. Le voyage est rétabli pour la promotion 2026.',
    );
    const edited = await prisma.reviewResponse.findUniqueOrThrow({ where: { reviewId } });
    expect(edited.status).toBe('PENDING');
    expect(edited.editedAt).not.toBeNull();
    // the review itself is never changed by a reply
    expect(
      await prisma.review.findUniqueOrThrow({
        where: { id: reviewId },
        select: { status: true, cons: true },
      }),
    ).toEqual({
      status: 'PUBLISHED',
      cons: 'Le voyage d’étude a été remplacé par deux sorties.',
    });
  });

  it('a refused reply needs a reason, and no longer blocks a colleague', async () => {
    await saveResponse(responders.a, reviewId, 'Merci pour ce retour, nous en parlons en conseil.');
    const row = await prisma.reviewResponse.findUniqueOrThrow({ where: { reviewId } });
    expect(await decideReviewResponse(admin, row.id, 'reject', '')).toEqual({
      ok: false,
      error: 'Indique un motif.',
    });
    expect(
      await decideReviewResponse(admin, row.id, 'reject', 'Attaque l’auteur·rice de l’avis'),
    ).toMatchObject({ ok: true });
    expect(
      await saveResponse(
        responders.b,
        reviewId,
        'Merci pour cet avis : le programme du voyage est publié.',
      ),
    ).toMatchObject({ ok: true });
    expect(await prisma.reviewResponse.findUniqueOrThrow({ where: { reviewId } })).toMatchObject({
      responderId: responders.b.id,
      status: 'PENDING',
      reason: null,
    });
  });
});
