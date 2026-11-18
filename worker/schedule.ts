/** Scheduled work: syncs according to each source's cron, and daily maintenance tasks. */
import { CronExpressionParser } from 'cron-parser';
import { appUrl } from '../emails/Layout';
import { inactivityReminderMail, savedDigestMail } from '../emails/templates';
import { enqueueRun } from '../lib/connectors/runner';
import { decrypt } from '../lib/crypto';
import { prisma } from '../lib/db';
import { sendMailSafe } from '../lib/mail/send';
import { getSettings } from '../lib/settings';
import { FIXED_SETTINGS } from '../lib/settings-defaults';
import { deleteDocument } from '../lib/uploads';
import { purgeSnapshots } from '../lib/data/snapshot';
import { purgeAuditLog, purgePersonalData, purgeSyncJournal } from '../lib/admin/retention';
import { sendQuestionDigests } from '../lib/questions';
import { refreshZoneCommunes } from '../lib/launch/admin';
import { invalidateTagsRemote, TAGS } from '../lib/cache/tags';

const DAY = 24 * 3600_000;

async function lastRun(key: string): Promise<Date | null> {
  return (await prisma.scheduledTask.findUnique({ where: { key } }))?.lastRunAt ?? null;
}
async function markRun(key: string, at = new Date()) {
  await prisma.scheduledTask.upsert({
    where: { key },
    create: { key, lastRunAt: at },
    update: { lastRunAt: at },
  });
}

/** Enqueues a sync for every enabled source whose cron fired since the last check. */
export async function scheduleSyncs(now = new Date()) {
  const sources = await prisma.dataSource.findMany({
    // « Pause 7 jours » (Récupération): no scheduled pass until then.
    where: {
      enabled: true,
      schedule: { not: null },
      OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
    },
  });
  for (const s of sources) {
    let prev: Date;
    try {
      prev = CronExpressionParser.parse(s.schedule!, { currentDate: now, tz: 'Europe/Paris' })
        .prev()
        .toDate();
    } catch {
      continue;
    }
    const key = `sync:${s.key}`;
    const last = await lastRun(key);
    if (!last) {
      await markRun(key, now); // first start: do not replay the past
      continue;
    }
    if (prev > last) {
      await enqueueRun(s.id, 'schedule');
      await markRun(key, now);
      console.log(`[worker] scheduled sync queued: ${s.key}`);
    }
  }
}

/** Daily maintenance (retention rules of the settings). */
export async function dailyMaintenance(now = new Date()) {
  const key = 'maintenance:daily';
  const last = await lastRun(key);
  if (last && now.getTime() - last.getTime() < DAY) return;
  await markRun(key, now);
  const settings = await getSettings();

  // Messages: conversations deleted 12 months after the last exchange.
  const msgCutoff = new Date(now.getTime() - FIXED_SETTINGS.messageRetentionMonths * 30.44 * DAY);
  const convs = await prisma.conversation.deleteMany({
    where: { lastMessageAt: { lt: msgCutoff } },
  });

  // Tokens: expired or used for more than a day.
  const tokens = await prisma.magicLinkToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(now.getTime() - DAY) } },
        { usedAt: { lt: new Date(now.getTime() - DAY) } },
      ],
    },
  });

  // Connection logs: kept one year.
  const logs = await prisma.connectionLog.deleteMany({
    where: { at: { lt: new Date(now.getTime() - 365 * DAY) } },
  });

  // Infrastructure tables.
  await prisma.rateLimitHit.deleteMany({
    where: { at: { lt: new Date(now.getTime() - 2 * DAY) } },
  });
  await prisma.job.deleteMany({
    where: { status: 'DONE', updatedAt: { lt: new Date(now.getTime() - 30 * DAY) } },
  });

  // Data pipeline: staging purged 30 days after the run was applied (or finished without being
  // applied); raw snapshots kept per the retention setting (pinned ones are kept).
  const stagingCutoff = new Date(now.getTime() - 30 * DAY);
  const staging = await prisma.stagingRecord.deleteMany({
    where: {
      run: {
        OR: [
          { appliedAt: { lt: stagingCutoff } },
          { appliedAt: null, finishedAt: { lt: stagingCutoff } },
        ],
      },
    },
  });
  let snapshots = 0;
  for (const src of await prisma.dataSource.findMany({ select: { key: true } }))
    snapshots += await purgeSnapshots(src.key, settings['data.snapshotRetention']);
  console.log(`[worker] data: ${staging.count} staged records, ${snapshots} raw snapshots purged`);
  // Sync journal (Récupération › Journal): passes 90 days, log lines 30 days.
  const journal = await purgeSyncJournal(now);
  console.log(`[worker] journal: ${journal.runs} passes, ${journal.lines} log lines purged`);
  // Audit log: 1 year, 5 years for the legal requests.
  console.log(`[worker] audit: ${await purgeAuditLog(now)} entries purged`);
  console.log(`[worker] personal data purged: ${JSON.stringify(await purgePersonalData(now))}`);

  // Inactive accounts: reminder 30 days before deletion, then deletion.
  const years = settings['legal.inactiveAccountYears'];
  const deleteBefore = new Date(now.getTime() - years * 365 * DAY);
  const remindBefore = new Date(deleteBefore.getTime() + 30 * DAY);
  const toRemind = await prisma.student.findMany({
    where: {
      deletedAt: null,
      isDemo: false,
      lastSeenAt: { lt: remindBefore },
      inactivityWarnedAt: null,
    },
  });
  for (const s of toRemind) {
    await sendMailSafe(
      decrypt(s.emailEnc),
      inactivityReminderMail({ deleteOn: new Date(s.lastSeenAt.getTime() + years * 365 * DAY) }),
    );
    await prisma.student.update({ where: { id: s.id }, data: { inactivityWarnedAt: now } });
  }
  const toDelete = await prisma.student.findMany({
    where: {
      deletedAt: null,
      isDemo: false,
      lastSeenAt: { lt: deleteBefore },
      inactivityWarnedAt: { lt: new Date(now.getTime() - 30 * DAY) },
    },
    include: { verifications: true, reviews: { select: { id: true } } },
  });
  for (const s of toDelete) {
    for (const v of s.verifications) await deleteDocument(v.documentPath);
    await prisma.$transaction([
      prisma.conversation.deleteMany({
        where: { OR: [{ review: { studentId: s.id } }, { askerStudentId: s.id }] },
      }),
      ...s.reviews.map((r) =>
        prisma.review.update({
          where: { id: r.id },
          data: { studentId: null, authorEmailHash: `deleted:${r.id}`, acceptsQuestions: false },
        }),
      ),
      prisma.student.delete({ where: { id: s.id } }),
    ]);
  }
  console.log(
    `[worker] maintenance: ${convs.count} conversations, ${tokens.count} tokens, ${logs.count} connection logs purged; ${toRemind.length} reminders, ${toDelete.length} inactive accounts deleted`,
  );
}

/**
 * Weekly digest of new reviews on followed masters, for students who asked for it
 * (notifySavedDigest). Never their own reviews; at most one mail a week.
 */
export async function weeklyDigest(now = new Date()) {
  const key = 'digest:weekly';
  const last = await lastRun(key);
  if (last && now.getTime() - last.getTime() < 7 * DAY) return;
  await markRun(key, now);
  const since = last ?? new Date(now.getTime() - 7 * DAY);
  const students = await prisma.student.findMany({
    where: { notifySavedDigest: true, deletedAt: null, favorites: { some: {} } },
    select: {
      id: true,
      emailEnc: true,
      favorites: { select: { program: { select: { id: true, title: true, slug: true } } } },
    },
  });
  for (const s of students) {
    const items: { programTitle: string; count: number; url: string }[] = [];
    for (const { program } of s.favorites) {
      const count = await prisma.review.count({
        where: {
          programId: program.id,
          status: 'PUBLISHED',
          publishedAt: { gte: since },
          NOT: { studentId: s.id },
        },
      });
      if (count)
        items.push({
          programTitle: program.title,
          count,
          url: `${appUrl()}/parcours/${program.slug}`,
        });
    }
    if (items.length)
      await sendMailSafe(
        decrypt(s.emailEnc),
        savedDigestMail({ items, settingsUrl: `${appUrl()}/espace/compte` }),
      );
  }
}

/**
 * Questions publiques: weekly digest of the unanswered questions to the verified alumni who
 * accept questions. A question is never listed twice to the same person.
 */
export async function weeklyQuestionDigest(now = new Date()) {
  const key = 'questions:weekly';
  const last = await lastRun(key);
  if (last && now.getTime() - last.getTime() < 7 * DAY) return;
  await markRun(key, now);
  const mails = await sendQuestionDigests();
  if (mails) console.log(`[worker] public questions digest: ${mails} mails`);
}

/**
 * Villes ouvertes: the communes of each intercommunality are read again once a year (communes
 * merge, EPCIs change). Checked once a day; a zone whose list changed re-flags its programs and
 * the site's caches are expired.
 */
export async function yearlyZoneCommunes(now = new Date()) {
  const key = 'zones:communes';
  const last = await lastRun(key);
  if (last && now.getTime() - last.getTime() < DAY) return;
  await markRun(key, now);
  try {
    const changed = await refreshZoneCommunes(now);
    if (changed.length) {
      console.log(`[worker] launch zones: communes changed for ${changed.join(', ')}`);
      await invalidateTagsRemote([TAGS.catalog, TAGS.footer, TAGS.zones]);
    }
  } catch (e) {
    console.error('[worker] launch zones: communes not refreshed', e);
  }
}
