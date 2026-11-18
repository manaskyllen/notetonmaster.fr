/** The name written like the logo: BrandName, withBrand, legal pages, mails. */
import { describe, expect, it } from 'vitest';
import { render, toPlainText } from '@react-email/render';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandName, brandHtml, withBrand } from '@/components/ui/BrandName';
import {
  answerPublishedMail,
  dataExportMail,
  emailChangeMail,
  responsePublishedMail,
  staffCodeMail,
} from '@/emails/templates';

const { readLegalDoc, LEGAL_DOCS } = await import('@/lib/legal');

/** Text nodes of an HTML string (attributes and the head excluded). */
const textNodes = (html: string) =>
  html
    .replace(/<head[\s\S]*?<\/head>/, '')
    .split(/<[^>]*>/)
    .filter(Boolean);
/**
 * A text node that writes « notetonmaster » as a plain word (not an address or a domain): the
 * component splits the name over three nodes, so no single node holds it.
 */
const plainName = (html: string) =>
  textNodes(html).find((t) => /(?<![\w@./-])notetonmaster(?![\w@-]|\.[a-z])/.test(t));

describe('BrandName', () => {
  it('keeps the DOM text « notetonmaster », one word: margins, no real space', () => {
    for (const size of ['sm', 'lg'] as const) {
      const html = renderToStaticMarkup(<BrandName size={size} />);
      expect(html).toBe(
        `<span class="${size === 'lg' ? 'brand' : 'brand-s'}">note<span class="brand__g">ton</span><span class="brand__m">master</span></span>`,
      );
      expect(textNodes(html).join('')).toBe('notetonmaster');
      expect(plainName(html)).toBeUndefined();
    }
  });

  it('withBrand puts the component in a sentence, never in an address or an identifier', () => {
    const html = renderToStaticMarkup(
      <p>
        {withBrand(
          'Ce master n’est pas encore sur notetonmaster : écris à dpo@notetonmaster.example.',
        )}
      </p>,
    );
    expect(html).toContain('sur <span class="brand-s">note');
    expect(html).toContain('dpo@notetonmaster.example');
    expect(withBrand('notetonmasterBot/1.0')).toBe('notetonmasterBot/1.0');
    expect(withBrand('Rien à voir')).toBe('Rien à voir');
  });

  it('brandHtml changes the text only, not the tags', () => {
    expect(
      brandHtml('<p>notetonmaster <a href="https://notetonmaster.example/a">ici</a></p>'),
    ).toBe(
      '<p><span class="brand-s">note<span class="brand__g">ton</span><span class="brand__m">master</span></span> <a href="https://notetonmaster.example/a">ici</a></p>',
    );
  });
});

describe('the name in the visible text', () => {
  it('legal pages: always the component', async () => {
    for (const d of LEGAL_DOCS) {
      const { html } = await readLegalDoc(d.slug);
      expect(plainName(html), d.slug).toBeUndefined();
    }
    expect((await readLegalDoc('mentions-legales')).html).toContain('class="brand-s"');
  });

  it('HTML mails: the component; plain-text mails and subjects: « notetonmaster »', async () => {
    const mails = [
      emailChangeMail({ url: 'https://x.test/a', code: '123456' }),
      staffCodeMail({ code: '123456', universityName: 'Nantes Université' }),
      responsePublishedMail({ programTitle: 'Droit', url: 'https://x.test/a' }),
      answerPublishedMail({ programTitle: 'Droit', url: 'https://x.test/a' }),
      dataExportMail(),
    ];
    for (const m of mails) {
      const html = await render(m.element);
      expect(plainName(html), m.subject).toBeUndefined();
      expect(toPlainText(html), m.subject).toMatch(/\bnotetonmaster\b/);
    }
    expect(mails[0]!.subject).toContain('notetonmaster');
  });
});
