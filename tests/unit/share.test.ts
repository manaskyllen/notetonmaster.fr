import { describe, expect, it } from 'vitest';
import {
  ficheUrl,
  reviewFormTitle,
  reviewFormUrl,
  shareText,
  whatsappUrl,
} from '@/lib/domain/share';
import { promoInvite, shareMessage, shareTitle, stickerCount } from '@/lib/domain/share-copy';

/** « Partager » of a fiche parcours (issue #13). */
const ORIGIN = 'https://notetonmaster.fr';
const SLUG = 'valorisation-des-nouveaux-patrimoines';
const facts = {
  parcours: 'Valorisation des nouveaux patrimoines',
  university: 'Nantes Université',
  city: 'Nantes',
  reviewCount: 2,
};

describe('share links', () => {
  it('give the canonical fiche and the review form set on the parcours', () => {
    expect(ficheUrl(ORIGIN, SLUG)).toBe(
      'https://notetonmaster.fr/parcours/valorisation-des-nouveaux-patrimoines',
    );
    expect(reviewFormUrl(ORIGIN, SLUG)).toBe(
      'https://notetonmaster.fr/avis/nouveau?parcours=valorisation-des-nouveaux-patrimoines',
    );
  });

  it('never carry a tracking parameter', () => {
    for (const url of [ficheUrl(ORIGIN, SLUG), reviewFormUrl(ORIGIN, SLUG)]) {
      const u = new URL(url);
      expect([...u.searchParams.keys()].filter((k) => k !== 'parcours')).toEqual([]);
      expect(url).not.toMatch(/utm_|ref=|source=|fbclid|gclid/);
    }
  });

  it('put the message, a space, then the link', () => {
    expect(shareText('  Hello la promo !  ', 'https://x.fr/a')).toBe(
      'Hello la promo ! https://x.fr/a',
    );
    expect(shareText('   ', 'https://x.fr/a')).toBe('https://x.fr/a');
  });

  it('build the WhatsApp link with the message and the link encoded', () => {
    const url = reviewFormUrl(ORIGIN, SLUG);
    const msg = 'Hello la promo ! C’est anonyme & ça prend 5 minutes →';
    const wa = whatsappUrl(msg, url);
    expect(wa.startsWith('https://wa.me/?text=')).toBe(true);
    expect(wa).not.toMatch(/\s/);
    // One parameter only: the « & » and the « ? » of the message and of the link are encoded.
    const params = new URL(wa).searchParams;
    expect([...params.keys()]).toEqual(['text']);
    expect(params.get('text')).toBe(`${msg} ${url}`);
  });
});

describe('share texts', () => {
  it('write the message of each tab, and the invitation after a review', () => {
    expect(shareMessage('decouvrir', facts)).toBe(
      'Regarde ce master : Valorisation des nouveaux patrimoines à Nantes, avec les chiffres d’admission et des avis d’étudiant·es →',
    );
    expect(shareMessage('promo', facts)).toBe(
      'Hello la promo ! On peut donner un avis anonyme sur notre master en 5 minutes. Ça aide celles et ceux qui candidatent l’an prochain →',
    );
    expect(shareMessage('promo', facts, 'after')).toMatch(
      /^Hello la promo ! Je viens de donner mon avis sur notre master\./,
    );
  });

  it('give the native share its titles', () => {
    expect(shareTitle('decouvrir', facts)).toBe(
      'Valorisation des nouveaux patrimoines — Nantes Université, sur notetonmaster',
    );
    expect(shareTitle('promo', facts)).toBe(reviewFormTitle(facts.parcours));
    expect(reviewFormTitle(facts.parcours)).toBe(
      'Donne ton avis sur Valorisation des nouveaux patrimoines',
    );
  });

  it('invite the promo on the confirmation screen: title, line, sticker', () => {
    const line = 'Invite ta promo à donner son avis : chaque avis rend la note plus juste.';
    expect(promoInvite(0)).toEqual({ title: 'Ce master n’a pas encore d’avis.', line });
    expect(promoInvite(1)).toEqual({ title: 'Ce master n’a que 1 avis.', line });
    expect(promoInvite(19)).toEqual({ title: 'Ce master n’a que 19 avis.', line });
    expect(promoInvite(20)).toEqual({ title: 'Invite ta promo à donner son avis.', line: null });
    expect([0, 1, 19, 20].map(stickerCount)).toEqual(['0', '1', '19', '20']);
  });
});
