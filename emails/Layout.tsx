import { Fragment } from 'react';
import { Body, Container, Head, Html, Link, Preview, Section, Text } from '@react-email/components';
import { BRAND_IN_TEXT } from '@/components/ui/BrandName';
import { contactEmail } from '@/lib/contact';

/** Light-theme literal colors: mail clients do not support CSS variables. */
export const C = {
  violet: '#5a3bf0',
  lime: '#d4f75a',
  night: '#16131f',
  ink: '#16131f',
  inkSoft: '#2a2635',
  muted: '#5e5a6b',
  surface50: '#f5f4f8',
  border: '#e4e2ea',
  page: '#e9e7ef',
} as const;

const font = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const display = "'Bricolage Grotesque', 'Arial Black', Arial, sans-serif";

export const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * The name in the text of a mail, like BrandName size="sm" with inline styles (mail clients drop
 * stylesheets): « note ton » bold, « master » on lime. Margins only, no real space: the plain-text
 * version still reads « notetonmaster ».
 */
export function MailBrand() {
  return (
    <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
      note<span style={{ marginLeft: '0.14em' }}>ton</span>
      <span
        style={{
          marginLeft: '0.12em',
          padding: '0 0.22em 0.04em',
          borderRadius: '0.3em',
          background: C.lime,
          color: C.night,
        }}
      >
        master
      </span>
    </span>
  );
}

/** A sentence of a mail with the name written by MailBrand. */
export function mailBrand(text: string): React.ReactNode {
  const parts = text.split(BRAND_IN_TEXT);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (
    <Fragment key={i}>
      {p}
      {i < parts.length - 1 && <MailBrand />}
    </Fragment>
  ));
}

export function Layout({
  preview,
  children,
  footer,
}: {
  preview: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const base = appUrl();
  const contact = contactEmail();
  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          background: C.page,
          fontFamily: font,
          color: C.ink,
          padding: '24px 12px',
        }}
      >
        <Container
          style={{ maxWidth: 600, background: '#ffffff', borderRadius: 24, overflow: 'hidden' }}
        >
          <Section style={{ background: C.violet, padding: '20px 28px' }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td>
                    <Link href={base} style={{ textDecoration: 'none' }} aria-label="notetonmaster">
                      <span
                        style={{
                          fontFamily: display,
                          fontWeight: 800,
                          fontSize: 22,
                          letterSpacing: '-0.045em',
                          color: '#ffffff',
                        }}
                      >
                        note<span style={{ marginLeft: '0.14em' }}>ton</span>
                      </span>
                      <span
                        style={{
                          fontFamily: display,
                          fontWeight: 800,
                          fontSize: 22,
                          letterSpacing: '-0.045em',
                          color: C.night,
                          background: C.lime,
                          borderRadius: 8,
                          padding: '0 7px 3px',
                          marginLeft: 2,
                          display: 'inline-block',
                          transform: 'rotate(-3deg)',
                        }}
                      >
                        master
                      </span>
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
          <Section style={{ padding: 28 }}>{children}</Section>
          <Section style={{ padding: '18px 28px', borderTop: `1px solid ${C.border}` }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: '1.6', color: C.muted }}>
              {typeof footer === 'string' || footer == null
                ? mailBrand(footer ?? 'Tu reçois ce mail suite à une action sur notetonmaster.')
                : footer}
              <br />
              <Link href={`${base}/legal/charte`} style={{ color: C.violet }}>
                Charte
              </Link>{' '}
              ·{' '}
              <Link href={`${base}/legal/confidentialite`} style={{ color: C.violet }}>
                Confidentialité
              </Link>
              <br />
              {/* The Reply-To of every mail is the same address (lib/mail/send.ts). */}
              Une question ? Écris-nous à{' '}
              <Link href={`mailto:${contact}`} style={{ color: C.violet }}>
                {contact}
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        margin: '0 0 16px',
        fontFamily: display,
        fontWeight: 800,
        fontSize: 28,
        lineHeight: '1.1',
        letterSpacing: '-0.02em',
      }}
    >
      {children}
    </Text>
  );
}

export function P({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <Text
      style={{
        margin: '0 0 16px',
        fontSize: muted ? 14 : 16,
        lineHeight: '1.55',
        color: muted ? C.muted : C.inkSoft,
      }}
    >
      {children}
    </Text>
  );
}

export function Quote({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        margin: '0 0 18px',
        padding: '14px 18px',
        borderRadius: 16,
        background: C.surface50,
        borderLeft: `4px solid ${C.violet}`,
        fontSize: 16,
        lineHeight: '1.55',
        color: C.ink,
      }}
    >
      {children}
    </Text>
  );
}

export function CTA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Section style={{ margin: '4px 0 18px' }}>
      <Link
        href={href}
        style={{
          display: 'inline-block',
          padding: '14px 26px',
          borderRadius: 999,
          background: C.lime,
          color: C.night,
          textDecoration: 'none',
          fontWeight: 800,
          fontSize: 16,
        }}
      >
        {children}
      </Link>
    </Section>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        margin: '0 0 18px',
        fontFamily: "'JetBrains Mono', Menlo, monospace",
        fontSize: 32,
        fontWeight: 700,
        letterSpacing: '0.3em',
        color: C.ink,
      }}
    >
      {children}
    </Text>
  );
}
