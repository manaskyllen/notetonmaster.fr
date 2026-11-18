/**
 * Contact details are masked on the server before a message is stored: mails, phone numbers
 * (French and international), social network links and handles. Always in the private messaging.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MASK, maskContacts } from '@/lib/domain/masking';

describe('maskContacts', () => {
  it.each([
    'écris-moi sur instagram.com/jean.dupont',
    'mon insta : https://www.instagram.com/jean_dupont/',
    'linkedin.com/in/jean-dupont-123',
    'https://fr.linkedin.com/in/jeandupont',
    'ajoute-moi : snapchat.com/add/jeandu',
    'wa.me/33612345678',
    'https://t.me/jeandupont',
    'discord.gg/abcdef',
    'facebook.com/jean.dupont.75',
    'tiktok.com/@jeandupont',
    'x.com/jeandupont',
    'twitter.com/jeandupont',
    'mon pseudo @jean_dupont',
    'appelle le +44 7911 123456',
    'ou le +32 470 12 34 56',
    'jean.dupont@univ-nantes.fr',
    '06 12 34 56 78',
  ])('masks « %s »', (text) => {
    const r = maskContacts(text);
    expect(r.masked).toBe(true);
    expect(r.text).toContain(MASK);
  });

  it.each([
    'Un stage de 6 mois en 2026, 30 ECTS',
    'Les cours ont lieu de 8 h à 18 h, salle 204.',
    'Note de 15/20 au premier semestre',
  ])('leaves « %s » as is', (text) => {
    expect(maskContacts(text)).toEqual({ text, masked: false });
  });

  it('stays linear on hostile input (no ReDoS)', () => {
    const hostile = `${'a'.repeat(50_000)}@${'b'.repeat(50_000)}`;
    const t = performance.now();
    maskContacts(hostile);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe('private messaging', () => {
  it('always masks: no setting can switch it off', () => {
    const service = readFileSync('lib/messaging/service.ts', 'utf8');
    expect(service).not.toMatch(/chat\.maskContacts/);
    expect(readFileSync('lib/settings-defaults.ts', 'utf8')).not.toMatch(/chat\.maskContacts/);
  });
});
