/**
 * rncp: France compétences RNCP export on data.gouv.fr (Licence Ouverte 2.0). The latest
 * `export-fiches-rncp-v4-1-AAAA-MM-JJ.zip` is found through the data.gouv.fr API (the dataset is
 * fixed, never a resource id), read in stream (zip → SAX), and every master fiche (level 7) is
 * mirrored in the Certification table. Active fiches are linked to the national mentions by
 * normalised title (exact, then similarity ≥ 0.92; proposal from 0.75); the mentions take the RNCP
 * name (accents, case) and identifiers RNCP / RNCP_PREVIOUS.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { StagingRecord } from '@/lib/db/generated/client';
import { MB, OPEN_DATA_PATTERNS } from '@/lib/data/http';
import { applyFieldChangesBulk, chunks, loadProvenance, planField } from '@/lib/data/merge';
import { planAction, type FieldChange, type RecordPlan } from '@/lib/data/diff';
import { fromDecision, loadDecisions } from '@/lib/data/match';
import { normMention, similarity } from '@/lib/data/normalize';
import { recordChecks, updateStaging } from '@/lib/data/pipeline';
import { saveSnapshot, snapshotPath } from '@/lib/data/snapshot';
import { getSettings } from '@/lib/settings';
import { allStaged } from '../monmaster-opendata/shared';
import { emptyStats, type PipelineConnector } from '../types';
import { openZipXml, readFiches, type RncpFiche } from './parse';

/** data.gouv.fr dataset « Répertoire national des certifications professionnelles et répertoire spécifique ». */
export const RNCP_DATASET = '5eebbc067a14b6fecc9c9976';
const RESOURCES = `https://www.data.gouv.fr/api/2/datasets/${RNCP_DATASET}/resources/?page=1&page_size=30`;
const EXPORT_TITLE = /^export-fiches-rncp-v4-1-(\d{4}-\d{2}-\d{2})\.zip$/;
const LABEL = 'France compétences · RNCP (Licence Ouverte 2.0)';
export const ficheUrl = (code: string) =>
  `https://www.francecompetences.fr/recherche/rncp/${code.replace(/^RNCP/, '')}/`;

const fiche = (s: StagingRecord) => s.normalized as unknown as RncpFiche;

/** "RNCP42684 (niveau 7)" — the summaries shown in the provenance panel. */
const summary = {
  certification: (f: RncpFiche) =>
    `${f.code} (niveau ${f.level ?? '?'})${f.active ? '' : ', inactive'}`,
  previous: (codes: string[]) => (codes.length ? codes.join(', ') : null),
  certifiers: (f: RncpFiche) =>
    f.certifiers
      .filter((c) => c.active)
      .map((c) => c.name)
      .join(', ') || null,
};

export const connector: PipelineConnector = {
  key: 'rncp',
  pipeline: true,
  // Exception données ouvertes (14/11/2026): the export file only, at most once a week.
  http: {
    allowedDomains: ['data.gouv.fr', 'static.data.gouv.fr'],
    openDataExceptions: [OPEN_DATA_PATTERNS.rncpExport],
  },

  async fetch(ctx) {
    const r = await ctx.http.get(RESOURCES, { accept: ['json'], maxBytes: 10 * MB });
    if (r.kind === 'skip') throw new Error(`liste des ressources : ${r.reason}`);
    if (r.kind !== 'response' || r.status !== 200 || !r.body)
      throw new Error('liste des ressources indisponible');
    const list = (JSON.parse(r.body.toString('utf8')) as { data: { title: string; url: string }[] })
      .data;
    const latest = list
      .map((x) => ({ ...x, date: x.title.match(EXPORT_TITLE)?.[1] }))
      .filter((x): x is typeof x & { date: string } => !!x.date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) throw new Error('aucune ressource export-fiches-rncp-v4-1 trouvée');
    const version = `export du ${latest.date}`;
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { id: ctx.sourceId } });
    if (source.version === version && !ctx.force)
      return { nothingNew: true, reason: 'pas de nouvel export', sourceVersion: version };
    // Download only when a new export is published, and at most once a week (exception données ouvertes).
    const last = await prisma.rawSnapshot.findFirst({
      where: { sourceId: ctx.sourceId, url: { endsWith: '.zip' } },
      orderBy: { fetchedAt: 'desc' },
    });
    if (
      last &&
      (last.url === latest.url || Date.now() - last.fetchedAt.getTime() < 7 * 24 * 3600_000)
    ) {
      const { id: _id, ...copy } = last;
      void _id;
      await prisma.rawSnapshot.create({ data: { ...copy, runId: ctx.runId } });
      await ctx.log(
        'INFO',
        last.url === latest.url
          ? `${latest.title} déjà téléchargé le ${last.fetchedAt.toISOString().slice(0, 10)} : réutilisé`
          : `nouvel export ${latest.date} publié, mais dernier téléchargement le ${last.fetchedAt.toISOString().slice(0, 10)} (moins d’une semaine) : export précédent réutilisé`,
      );
      return { nothingNew: false, sourceVersion: last.sourceVersion ?? version };
    }
    const file = snapshotPath(ctx.sourceKey, latest.title);
    await ctx.log('INFO', `téléchargement de ${latest.title}`);
    const d = await ctx.http.get(latest.url, {
      accept: ['zip'],
      toFile: file,
      maxBytes: 200 * MB,
      timeoutMs: 600_000,
    });
    if (d.kind === 'skip') throw new Error(`${latest.title} : ${d.reason}`);
    if (d.kind !== 'response' || d.status !== 200 || !d.file)
      throw new Error(`${latest.title} indisponible`);
    await saveSnapshot({
      sourceKey: ctx.sourceKey,
      runId: ctx.runId,
      url: latest.url,
      fileName: latest.title,
      file: d.file,
      sha256: d.sha256,
      contentType: d.contentType,
      httpStatus: 200,
      sourceVersion: version,
    });
    await ctx.log('OK', `${latest.title} : ${(d.bytes / MB).toFixed(1)} Mo`);
    return { nothingNew: false, sourceVersion: version };
  },

  async *parse(ctx, snapshots) {
    const zip = snapshots.find((s) => /\.zip$/i.test(s.storagePath));
    if (!zip) throw new Error('aucune archive RNCP dans ce passage');
    let read = 0;
    let masters = 0;
    let broken = 0;
    for await (const { fiche: f, missing } of readFiches(await openZipXml(zip.storagePath))) {
      read++;
      if (missing.length) broken++;
      if (read % 5000 === 0)
        await ctx.report({ progress: 20, step: `Lecture du RNCP · ${read} fiches` });
      if (!f.master || f.level !== 7 || !f.code) continue;
      masters++;
      yield {
        recordKey: f.code,
        payload: { code: f.code },
        normalized: { ...f, active: f.active } as never,
      };
    }
    await recordChecks(
      ctx.runId,
      { 'Structure des fiches RNCP (éléments obligatoires)': { executed: read, failed: broken } },
      { replace: true },
    );
    if (broken)
      await ctx.alert({
        key: 'schema-changed:rncp',
        code: 'schema-changed',
        severity: 'ERROR',
        title: 'Le format de la source a changé',
        detail: `${broken} fiches RNCP sans élément obligatoire (NUMERO_FICHE, INTITULE, ACTIF, NOMENCLATURE_EUROPE).`,
      });
    if (broken > read / 100)
      throw new Error(`Format du RNCP changé : ${broken} fiches incomplètes sur ${read}`);
    await ctx.log('OK', `${read} fiches lues, ${masters} fiches master de niveau 7`);
  },

  async match(ctx) {
    const t = (await getSettings())['data.matchThresholds'];
    const staged = await allStaged(ctx.runId);
    const mentions = await prisma.mention.findMany({
      select: { id: true, name: true, certification: { select: { code: true } } },
    });
    const byKey = new Map(mentions.map((m) => [normMention(m.name), m]));
    const decisions = await loadDecisions(ctx.sourceKey);
    // One active fiche per mention: the most recent (two active fiches share a title nationally).
    const winner = new Map<string, StagingRecord>();
    for (const s of staged) {
      const f = fiche(s);
      if (!f.active) continue;
      const cur = winner.get(f.mentionKey);
      if (!cur || (f.validFrom ?? '') > (fiche(cur).validFrom ?? '')) winner.set(f.mentionKey, s);
    }
    const upd = [];
    let linked = 0;
    let proposed = 0;
    for (const s of staged) {
      const f = fiche(s);
      const decided = fromDecision(decisions.get(s.recordKey));
      if (decided) {
        upd.push({
          id: s.id,
          matchStatus: decided.status,
          matchScore: decided.score,
          matchReason: decided.reason,
          targetType: 'MENTION',
          targetId: 'id' in decided ? decided.id : null,
        });
        continue;
      }
      if (!f.active || winner.get(f.mentionKey)?.id !== s.id) {
        upd.push({
          id: s.id,
          matchStatus: 'IGNORED',
          matchScore: 0,
          matchReason: f.active
            ? 'autre fiche active plus récente pour cet intitulé'
            : 'fiche inactive (gardée comme certification)',
          targetType: 'MENTION',
          targetId: null,
        });
        continue;
      }
      let m = byKey.get(f.mentionKey);
      let score = m ? 1 : 0;
      if (!m)
        for (const [k, cand] of byKey) {
          const sc = similarity(k, f.mentionKey);
          if (sc > score) {
            score = sc;
            m = cand;
          }
        }
      if (m && score >= 0.92) {
        linked++;
        upd.push({
          id: s.id,
          matchStatus: 'LINKED',
          matchScore: score,
          matchReason: score === 1 ? 'intitulé identique' : 'intitulé proche',
          targetType: 'MENTION',
          targetId: m.id,
        });
      } else if (m && score >= t.propose) {
        proposed++;
        upd.push({
          id: s.id,
          matchStatus: 'PROPOSED',
          matchScore: score,
          matchReason: `intitulé proche de « ${m.name} » (à valider)`,
          targetType: 'MENTION',
          targetId: m.id,
        });
      } else
        upd.push({
          id: s.id,
          matchStatus: 'NEW',
          matchScore: score,
          matchReason: 'pas encore de mention sur le site',
          targetType: 'MENTION',
          targetId: null,
        });
    }
    await updateStaging(upd);
    await ctx.log(
      'OK',
      `${staged.length} fiches master : ${linked} reliées à une mention, ${proposed} à valider`,
    );
  },

  async merge(ctx) {
    const staged = await allStaged(ctx.runId);
    const certs = new Map((await prisma.certification.findMany()).map((c) => [c.code, c]));
    const mentionIds = staged
      .filter((s) => s.matchStatus === 'LINKED' && s.targetId)
      .map((s) => s.targetId!);
    const prov = await loadProvenance('MENTION', mentionIds);
    const upd: { id: string; plan: RecordPlan }[] = [];
    for (const s of staged) {
      const f = fiche(s);
      const cur = certs.get(f.code);
      const changes: FieldChange[] = [];
      const cmp = (field: string, label: string, from: unknown, to: unknown) => {
        const same = JSON.stringify(from ?? null) === JSON.stringify(to ?? null);
        changes.push({
          entityType: 'CERTIFICATION',
          entityId: cur?.id ?? null,
          field,
          label,
          from: from ?? null,
          to: to ?? null,
          source: LABEL,
          outcome: !cur ? 'create' : same ? 'unchanged' : 'update',
        });
      };
      const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
      cmp('certification.title', 'Intitulé de la fiche', cur?.title, f.mentionTitle);
      cmp('certification.status', 'État', cur?.status, f.active ? 'ACTIVE' : 'INACTIVE');
      cmp('certification.validTo', 'Fin d’enregistrement', iso(cur?.validTo), f.validTo);
      cmp(
        'certification.lastDelivery',
        'Dernière délivrance',
        iso(cur?.lastDeliveryDate),
        f.lastDelivery,
      );
      if (s.matchStatus === 'LINKED' && s.targetId) {
        const src = {
          sourceKey: ctx.sourceKey,
          source: `${LABEL} · ${f.code}`,
          sourceUrl: ficheUrl(f.code),
        };
        const pf = (field: string, label: string, value: unknown) =>
          planField(prov, 'MENTION', s.targetId, field, label, { ...src, value });
        changes.push(pf('mentionName', 'Intitulé de la mention', f.mentionTitle));
        changes.push(pf('certification', 'Certification', summary.certification(f)));
        changes.push(pf('previousCertification', 'Ancienne fiche', summary.previous(f.previous)));
        changes.push(pf('certifiers', 'Certificateurs', summary.certifiers(f)));
      }
      const action: RecordPlan['action'] =
        s.matchStatus === 'PROPOSED' ? 'proposal' : !cur ? 'create' : planAction(changes);
      upd.push({
        id: s.id,
        plan: {
          action,
          target: {
            type: s.matchStatus === 'LINKED' ? 'mention' : 'certification',
            id: s.targetId ?? cur?.id ?? null,
            label: `${f.code} · ${f.mentionTitle}`,
          },
          changes,
          note: s.matchReason ?? undefined,
        },
      });
    }
    await updateStaging(upd);
  },

  async quality(ctx) {
    const staged = await allStaged(ctx.runId);
    const linked = new Set(staged.filter((s) => s.matchStatus === 'LINKED').map((s) => s.targetId));
    const mentions = await prisma.mention.findMany({
      where: { isPublished: true },
      select: { id: true, name: true },
    });
    const without = mentions.filter((m) => !linked.has(m.id));
    const today = new Date().toISOString().slice(0, 10);
    const expired = staged.filter(
      (s) => s.matchStatus === 'LINKED' && (fiche(s).validTo ?? '9999') < today,
    );
    await recordChecks(
      ctx.runId,
      {
        'Mention avec une fiche RNCP active': { executed: mentions.length, failed: without.length },
        'Fiche RNCP en cours de validité': { executed: linked.size, failed: expired.length },
      },
      { replace: true },
    );
    if (without.length)
      await ctx.alert({
        key: 'mention-without-rncp',
        code: 'mention-without-rncp',
        severity: 'WARNING',
        title: `${without.length} mention(s) sans fiche RNCP active`,
        detail: without
          .slice(0, 20)
          .map((m) => m.name)
          .join(', '),
        link: '/admin/recuperation/rapprochements',
        linkLabel: 'Voir',
        count: without.length,
      });
    if (expired.length)
      await ctx.alert({
        key: 'rncp-expired',
        code: 'rncp-expired',
        severity: 'WARNING',
        title: `${expired.length} fiche(s) RNCP expirée(s)`,
        detail: expired
          .slice(0, 20)
          .map((s) => fiche(s).code)
          .join(', '),
        count: expired.length,
      });
    return {};
  },

  async publish(ctx) {
    const counters: ReturnType<typeof emptyStats> & Record<string, unknown> = { ...emptyStats() };
    const staged = await allStaged(ctx.runId, { appliedAt: null });
    // 1. certifications (mirror of every master fiche), by batches
    const existing = new Set(
      (await prisma.certification.findMany({ select: { code: true } })).map((c) => c.code),
    );
    const rows = staged.map((s) => {
      const f = fiche(s);
      return {
        code: f.code,
        title: f.mentionTitle,
        level: f.level,
        status: f.active ? 'ACTIVE' : 'INACTIVE',
        validFrom: f.validFrom,
        validTo: f.validTo,
        lastDeliveryDate: f.lastDelivery,
        replacesCode: f.previous[0] ?? null,
        certifiers: f.certifiers.filter((c) => c.active).map((c) => c.name),
        sourceUrl: ficheUrl(f.code),
      };
    });
    for (const part of chunks(rows.filter((r) => !existing.has(r.code)))) {
      await prisma.certification.createMany({
        data: part.map((r) => ({
          ...r,
          id: randomUUID(),
          status: r.status as 'ACTIVE' | 'INACTIVE',
          validFrom: r.validFrom ? new Date(r.validFrom) : null,
          validTo: r.validTo ? new Date(r.validTo) : null,
          lastDeliveryDate: r.lastDeliveryDate ? new Date(r.lastDeliveryDate) : null,
          updatedAt: new Date(),
        })),
        skipDuplicates: true,
      });
      counters.created += part.length;
    }
    for (const part of chunks(rows.filter((r) => existing.has(r.code))))
      // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
      await prisma.$executeRawUnsafe(
        `UPDATE "Certification" AS c SET "title" = v.title, "level" = v.level, "status" = v.status::"CertificationStatus",
           "validFrom" = v."validFrom"::timestamp, "validTo" = v."validTo"::timestamp, "lastDeliveryDate" = v."lastDeliveryDate"::timestamp,
           "replacesCode" = v."replacesCode", "certifiers" = ARRAY(SELECT jsonb_array_elements_text(v.certifiers)),
           "sourceUrl" = v."sourceUrl", "updatedAt" = now()
         FROM jsonb_to_recordset($1::jsonb) AS v(code text, title text, level int, status text, "validFrom" text, "validTo" text,
           "lastDeliveryDate" text, "replacesCode" text, certifiers jsonb, "sourceUrl" text)
         WHERE c.code = v.code`,
        JSON.stringify(part),
      );
    await ctx.report({ progress: 92, step: 'Publication · mentions' });
    // 2. mentions linked to their active fiche: provenance (RNCP has priority on the name), columns
    const linkedRecords = staged.filter((s) => s.matchStatus === 'LINKED' && s.targetId);
    const changes = linkedRecords.flatMap((s) =>
      ((s.plan as unknown as RecordPlan).changes ?? [])
        .filter((c) => c.entityType === 'MENTION')
        .map((c) => ({
          change: c,
          entityId: s.targetId!,
          conflictTitle: `${c.label} · ${fiche(s).mentionTitle}`,
        })),
    );
    const values = await applyFieldChangesBulk(changes, ctx.sourceKey, counters);
    const certIds = new Map(
      (await prisma.certification.findMany({ select: { id: true, code: true } })).map((c) => [
        c.code,
        c.id,
      ]),
    );
    const mentionRows = linkedRecords.map((s) => {
      const f = fiche(s);
      const name = values.get(s.targetId!)?.get('mentionName');
      return {
        id: s.targetId!,
        name: typeof name === 'string' && name ? name : null,
        rncpCode: f.code,
        rncpStatus: f.active ? 'Active' : 'Inactive',
        certificationId: certIds.get(f.code) ?? null,
      };
    });
    for (const part of chunks(mentionRows))
      // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
      await prisma.$executeRawUnsafe(
        `UPDATE "Mention" AS m SET "name" = COALESCE(v.name, m.name), "rncpCode" = v."rncpCode", "rncpStatus" = v."rncpStatus",
           "certificationId" = v."certificationId", "updatedAt" = now()
         FROM jsonb_to_recordset($1::jsonb) AS v(id text, name text, "rncpCode" text, "rncpStatus" text, "certificationId" text)
         WHERE m.id = v.id`,
        JSON.stringify(part),
      );
    // 3. identifiers: the active fiche and the fiches it replaces (searchable "RNCP35804")
    const ids = linkedRecords.flatMap((s) => {
      const f = fiche(s);
      return [
        {
          id: randomUUID(),
          entityType: 'MENTION' as const,
          entityId: s.targetId!,
          kind: 'RNCP' as const,
          value: f.code,
          label: 'RNCP',
        },
        ...f.previous.map((p) => ({
          id: randomUUID(),
          entityType: 'MENTION' as const,
          entityId: s.targetId!,
          kind: 'RNCP_PREVIOUS' as const,
          value: p,
          label: 'RNCP (ancienne)',
        })),
      ];
    });
    for (const part of chunks(ids))
      await prisma.identifier.createMany({ data: part, skipDuplicates: true });
    await prisma.stagingRecord.updateMany({
      where: { runId: ctx.runId, appliedAt: null },
      data: { appliedAt: new Date() },
    });
    counters.certifications = rows.length;
    counters.mentionsLinked = linkedRecords.length;
    return counters;
  },
};
