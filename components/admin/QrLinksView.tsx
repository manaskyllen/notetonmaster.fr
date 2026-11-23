'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Panel } from '@/components/admin/ui';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/form/Field';
import { Input, NativeSelect } from '@/components/ui/form/Controls';
import { Modal } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/Notice';
import {
  LABEL_MAX,
  proposeSlug,
  SLUG_MAX,
  TARGET_KIND_LABEL,
  targetFor,
  targetKindOf,
  type TargetKind,
} from '@/lib/domain/qr';
import { archiveQrLink, createQrLink, updateQrLink } from '@/app/admin/(panel)/qr/actions';

export interface QrRow {
  id: string;
  slug: string;
  label: string;
  targetPath: string;
  created: string;
  archived: boolean;
  total: number;
  last7: number;
  last30: number;
}

type City = { slug: string; name: string };
type Flash = { tone: 'success' | 'danger'; text: string } | null;
const KINDS = Object.keys(TARGET_KIND_LABEL) as TargetKind[];
const nf = new Intl.NumberFormat('fr-FR');

/** Target: accueil, formulaire d'avis, page d'une ville ouverte, or an internal path. */
function TargetFields({
  kind,
  value,
  cities,
  onKind,
  onValue,
  idPrefix,
}: {
  kind: TargetKind;
  value: string;
  cities: City[];
  onKind: (k: TargetKind) => void;
  onValue: (v: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Field label="Cible" id={`${idPrefix}-kind`} className="min-w-0 flex-[1_1_200px]">
        {(a) => (
          <NativeSelect
            {...a}
            value={kind}
            onChange={(e) => onKind(e.target.value as TargetKind)}
            options={KINDS.map((k) => ({ value: k, label: TARGET_KIND_LABEL[k] }))}
          />
        )}
      </Field>
      {kind === 'ville' && (
        <Field label="Ville ouverte" id={`${idPrefix}-city`} className="min-w-0 flex-[1_1_200px]">
          {(a) => (
            <NativeSelect
              {...a}
              value={value}
              onChange={(e) => onValue(e.target.value)}
              placeholder="Choisir…"
              options={cities.map((c) => ({ value: c.slug, label: c.name }))}
            />
          )}
        </Field>
      )}
      {kind === 'path' && (
        <Field
          label="Chemin interne"
          id={`${idPrefix}-path`}
          hint="Commence par un seul « / » : /masters/nantes, /explorer…"
          className="min-w-0 flex-[2_1_260px]"
        >
          {(a) => (
            <Input
              {...a}
              value={value}
              onChange={(e) => onValue(e.target.value)}
              placeholder="/masters/nantes"
            />
          )}
        </Field>
      )}
    </div>
  );
}

/**
 * « QR codes » (issue #17): short links of the printed supports, their scans (counted per day,
 * nothing about the visitor), creation, change of label or target, archiving, downloads.
 */
export function QrLinksView({
  rows,
  cities,
  origin,
}: {
  rows: QrRow[];
  cities: City[];
  origin: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<Flash>(null);
  const host = origin.replace(/^https?:\/\//, '');

  // Creation
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [kind, setKind] = useState<TargetKind>('home');
  const [value, setValue] = useState('');
  const shownSlug = slugTouched ? slug : proposeSlug(label);

  // Edition and archiving
  const [editing, setEditing] = useState<QrRow | null>(null);
  const [eLabel, setELabel] = useState('');
  const [eKind, setEKind] = useState<TargetKind>('home');
  const [eValue, setEValue] = useState('');
  const [archiving, setArchiving] = useState<QrRow | null>(null);

  const done = (r: { ok: boolean; message?: string; error?: string }, after?: () => void) => {
    setFlash(r.ok ? { tone: 'success', text: r.message! } : { tone: 'danger', text: r.error! });
    if (r.ok) {
      after?.();
      router.refresh();
    }
  };

  return (
    <div className="flex flex-col gap-4.5">
      <div role="status" aria-live="polite">
        {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      </div>
      <Panel title="Nouveau lien">
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () =>
              done(
                await createQrLink({ label, slug: shownSlug, targetPath: targetFor(kind, value) }),
                () => {
                  setLabel('');
                  setSlug('');
                  setSlugTouched(false);
                  setKind('home');
                  setValue('');
                },
              ),
            );
          }}
        >
          <div className="flex flex-wrap gap-3">
            <Field label="Libellé" id="qr-label" className="min-w-0 flex-[2_1_260px]">
              {(a) => (
                <Input
                  {...a}
                  value={label}
                  maxLength={LABEL_MAX}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Sous-bock vert · Nantes"
                />
              )}
            </Field>
            <Field
              label="Adresse courte"
              id="qr-slug"
              hint={`${host}/q/${shownSlug || '…'}`}
              className="min-w-0 flex-[1_1_200px]"
            >
              {(a) => (
                <Input
                  {...a}
                  value={shownSlug}
                  maxLength={SLUG_MAX}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value.toLowerCase());
                  }}
                />
              )}
            </Field>
          </div>
          <TargetFields
            idPrefix="qr"
            kind={kind}
            value={value}
            cities={cities}
            onKind={(k) => {
              setKind(k);
              setValue('');
            }}
            onValue={setValue}
          />
          <div>
            <Button type="submit" size="m" disabled={pending}>
              Créer le lien
            </Button>
          </div>
        </form>
      </Panel>

      <div className="relative overflow-x-auto rounded-lg border border-border bg-surface-0">
        <table className="w-full min-w-[880px] border-collapse text-[14px]">
          <caption className="sr-only">Liens des QR codes</caption>
          <thead>
            <tr>
              {[
                'Libellé',
                'Adresse courte',
                'Cible',
                'Scans',
                '7 jours',
                '30 jours',
                'Créé le',
                '',
              ].map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  className="border-b border-border px-3 py-3 text-left text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase"
                >
                  {h || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.archived ? 'text-ink-muted' : undefined}>
                <td className="border-b border-border px-3 py-2.5 font-semibold">
                  <Link href={`/admin/qr/${r.id}`}>{r.label}</Link>
                  {r.archived && (
                    <span className="ml-2 rounded-pill bg-surface-100 px-2 py-0.5 text-[12px] font-bold">
                      Archivé
                    </span>
                  )}
                </td>
                <td className="border-b border-border px-3 py-2.5 font-mono text-[13px] whitespace-nowrap">
                  {host}/q/{r.slug}
                </td>
                <td className="border-b border-border px-3 py-2.5 font-mono text-[13px] break-all">
                  {r.archived ? '/ (archivé)' : r.targetPath}
                </td>
                <td className="border-b border-border px-3 py-2.5 font-bold tabular-nums">
                  {nf.format(r.total)}
                </td>
                <td className="border-b border-border px-3 py-2.5 tabular-nums">
                  {nf.format(r.last7)}
                </td>
                <td className="border-b border-border px-3 py-2.5 tabular-nums">
                  {nf.format(r.last30)}
                </td>
                <td className="border-b border-border px-3 py-2.5 font-mono text-[12px] whitespace-nowrap">
                  {r.created}
                </td>
                <td className="border-b border-border px-3 py-2.5">
                  <span className="flex flex-wrap gap-1.5">
                    <a
                      href={`/admin/qr/${r.id}/code`}
                      download
                      className="inline-flex min-h-10 items-center px-2 font-semibold"
                      aria-label={`Télécharger le QR code de ${r.label} en SVG`}
                    >
                      SVG
                    </a>
                    <a
                      href={`/admin/qr/${r.id}/code?format=png`}
                      download
                      className="inline-flex min-h-10 items-center px-2 font-semibold"
                      aria-label={`Télécharger le QR code de ${r.label} en PNG`}
                    >
                      PNG
                    </a>
                    {!r.archived && (
                      <>
                        <Button
                          variant="outline"
                          size="s"
                          aria-label={`Modifier ${r.label}`}
                          onClick={() => {
                            const t = targetKindOf(r.targetPath);
                            setEditing(r);
                            setELabel(r.label);
                            setEKind(t.kind);
                            setEValue(t.value);
                          }}
                        >
                          Modifier
                        </Button>
                        <Button
                          variant="ghost"
                          size="s"
                          aria-label={`Archiver ${r.label}`}
                          onClick={() => setArchiving(r)}
                        >
                          Archiver
                        </Button>
                      </>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-7 text-center text-ink-muted">Aucun lien pour l’instant.</div>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} labelledBy="qr-edit-title">
        {editing && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () =>
                done(
                  await updateQrLink({
                    id: editing.id,
                    label: eLabel,
                    targetPath: targetFor(eKind, eValue),
                  }),
                  () => setEditing(null),
                ),
              );
            }}
          >
            <h2 id="qr-edit-title" className="m-0 font-display text-[24px] font-extrabold">
              Modifier /q/{editing.slug}
            </h2>
            <p className="m-0 text-[14px] text-ink-muted">
              L’adresse courte ne change pas : elle est imprimée.
            </p>
            <Field label="Libellé" id="qr-edit-label">
              {(a) => (
                <Input
                  {...a}
                  value={eLabel}
                  maxLength={LABEL_MAX}
                  onChange={(e) => setELabel(e.target.value)}
                />
              )}
            </Field>
            <TargetFields
              idPrefix="qr-edit"
              kind={eKind}
              value={eValue}
              cities={cities}
              onKind={(k) => {
                setEKind(k);
                setEValue('');
              }}
              onValue={setEValue}
            />
            <div className="flex flex-wrap gap-2.5">
              <Button type="submit" size="m" disabled={pending}>
                Enregistrer
              </Button>
              <Button variant="outline" size="m" onClick={() => setEditing(null)}>
                Annuler
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!archiving} onClose={() => setArchiving(null)} labelledBy="qr-archive-title">
        {archiving && (
          <div className="flex flex-col gap-4">
            <h2 id="qr-archive-title" className="m-0 font-display text-[24px] font-extrabold">
              Archiver /q/{archiving.slug} ?
            </h2>
            <p className="m-0 text-[15px]">
              Les QR codes déjà imprimés mèneront à l’accueil, sans être comptés. L’adresse courte
              ne pourra pas servir à un autre lien.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Button
                variant="danger"
                size="m"
                disabled={pending}
                onClick={() =>
                  start(async () =>
                    done(await archiveQrLink(archiving.id), () => setArchiving(null)),
                  )
                }
              >
                Archiver
              </Button>
              <Button variant="outline" size="m" onClick={() => setArchiving(null)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
