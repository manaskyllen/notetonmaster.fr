/**
 * Rights matrix (docs/matrice-des-droits.md): every Server Action checks the session and the
 * role itself, the button being hidden or not.
 *
 * - Static: the permission each admin action asks for is the one of the matrix.
 * - Dynamic, with real sessions (4 admin roles, a student, a teaching-team member, a visitor):
 *   each action is called by each role that has no right to it, and must be refused before any
 *   effect. Read-only actions are also called by the roles that have the right.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request, run } = await import('../helpers/request');
const { adminAs, studentAs, staffAs, cleanupActors } = await import('../helpers/actors');
const { can } = await import('@/lib/domain/permissions');
type Permission = Parameters<typeof can>[1];
type Role = 'ADMIN' | 'MODERATOR' | 'DATA_EDITOR' | 'LEGAL';

const NONE = 'matrice-inexistant';
const FORBIDDEN = 'Action non autorisée pour ce rôle.';

/** module (under app/admin), export, permission, arguments, read-only (safe to run when allowed). */
type Row = [string, string, Permission, unknown[], boolean?];
const ADMIN_MATRIX: Row[] = [
  ['(panel)/actions.ts', 'resolveAlert', 'data.edit', [NONE]],
  ['(panel)/audit/actions.ts', 'loadAuditPage', 'dashboard.view', ['', ''], true],
  ['(panel)/audit/actions.ts', 'startAuditExport', 'audit.export', ['']],
  [
    '(panel)/avis/actions.ts',
    'bulkReviews',
    'moderation.manage',
    [{ ids: [NONE], action: 'publish', reason: '' }],
  ],
  [
    '(panel)/equipe/actions.ts',
    'inviteMember',
    'team.manage',
    [{ email: 'matrice@example.org', role: 'MODERATOR' }],
  ],
  ['(panel)/equipe/actions.ts', 'changeRole', 'team.manage', [NONE, 'MODERATOR']],
  ['(panel)/equipe/actions.ts', 'removeMember', 'team.manage', [NONE]],
  ['(panel)/fiches/actions.ts', 'setPublished', 'data.edit', ['PROGRAM', NONE, true]],
  ['(panel)/fiches/actions.ts', 'setSector', 'data.edit', [NONE, 'PUBLIC']],
  ['(panel)/fiches/actions.ts', 'loadFicheDrawer', 'dashboard.view', [NONE], true],
  ['(panel)/fiches/actions.ts', 'ignoreIssue', 'data.edit', [NONE]],
  ['(panel)/fiches/actions.ts', 'startBulk', 'data.edit', [{ action: 'publish', ids: [NONE] }]],
  ['(panel)/fiches/actions.ts', 'bulkStatus', 'dashboard.view', [NONE], true],
  [
    '(panel)/fiches/actions.ts',
    'saveView',
    'dashboard.view',
    ['Vue matrice', 'vue=a-traiter'],
    true,
  ],
  ['(panel)/fiches/actions.ts', 'deleteView', 'dashboard.view', [NONE], true],
  ['(panel)/fiches/actions.ts', 'searchUniversities', 'dashboard.view', ['nan'], true],
  ['(panel)/fiches/[id]/actions.ts', 'saveFiche', 'data.edit', [NONE, {}]],
  ['(panel)/fiches/[id]/actions.ts', 'saveProgramme', 'data.edit', [NONE, {}]],
  ['(panel)/fiches/[id]/actions.ts', 'importBooklet', 'data.edit', [NONE, 'https://example.org/']],
  [
    '(panel)/moderation/actions.ts',
    'moderate',
    'moderation.manage',
    [{ kind: 'avis', id: NONE, action: 'publish' }],
  ],
  ['(panel)/parametres/actions.ts', 'saveSettings', 'team.manage', [{}]],
  ['(panel)/parametres/actions.ts', 'saveBanner', 'team.manage', [{}]],
  ['(panel)/parametres/villes-actions.ts', 'saveZones', 'team.manage', [[]]],
  ['(panel)/parametres/villes-actions.ts', 'findEpcis', 'team.manage', ['nan'], true],
  [
    '(panel)/parametres/villes-actions.ts',
    'addLaunchZone',
    'team.manage',
    [{ code: NONE, name: 'X' }],
  ],
  ['(panel)/recuperation/actions.ts', 'runSource', 'sync.run', [NONE, 'PREVIEW']],
  ['(panel)/recuperation/actions.ts', 'applyRun', 'sync.validate', [NONE]],
  ['(panel)/recuperation/actions.ts', 'runAll', 'sync.run', []],
  ['(panel)/recuperation/actions.ts', 'resolveConflict', 'data.edit', [NONE, NONE]],
  ['(panel)/recuperation/actions.ts', 'applyRule', 'data.edit', [NONE, NONE]],
  ['(panel)/recuperation/actions.ts', 'retryCollect', 'sync.run', [NONE]],
  ['(panel)/recuperation/actions.ts', 'pauseCollect', 'sync.run', [NONE]],
  ['(panel)/recuperation/actions.ts', 'loadGroupItems', 'dashboard.view', [NONE], true],
  ['(panel)/recuperation/actions.ts', 'loadRunLines', 'dashboard.view', [NONE], true],
  [
    '(panel)/recuperation/actions.ts',
    'configureProfile',
    'data.edit',
    [NONE, 'drupal', 'https://example.org/'],
  ],
  [
    '(panel)/recuperation/actions.ts',
    'loadRuns',
    'dashboard.view',
    [{ source: null, level: null, days: null }, ''],
    true,
  ],
  [
    '(panel)/recuperation/rapprochements/actions.ts',
    'decideProposals',
    'data.edit',
    [[NONE], true],
  ],
  ['(panel)/recuperation/rapprochements/actions.ts', 'decideFiltered', 'data.edit', [{}, true]],
  ['(panel)/recuperation/rapprochements/actions.ts', 'mergeAllRecommended', 'data.edit', []],
  ['(panel)/recuperation/rapprochements/actions.ts', 'recomputeRun', 'sync.run', [NONE]],
  ['(panel)/recuperation/rapprochements/actions.ts', 'confirmNotRenewed', 'data.edit', [[NONE]]],
  [
    '(panel)/recuperation/rapprochements/actions.ts',
    'decideParent',
    'data.edit',
    [NONE, NONE, true],
  ],
];
/** Actions whose permission depends on their input: a second row for the other permission. */
const DYNAMIC: Row[] = [
  [
    '(panel)/moderation/actions.ts',
    'moderate',
    'legal.manage',
    [{ kind: 'legal', id: NONE, action: 'refuse', reason: 'x' }],
  ],
  ['(panel)/fiches/actions.ts', 'startBulk', 'dashboard.view', [{ action: 'export', ids: [NONE] }]],
  ['(panel)/fiches/actions.ts', 'startBulk', 'sync.run', [{ action: 'resync', ids: [NONE] }]],
];

const ROLES: Role[] = ['ADMIN', 'MODERATOR', 'DATA_EDITOR', 'LEGAL'];
const sessions = {} as Record<
  Role | 'student' | 'staff' | 'visitor',
  { name: string; value: string; options?: Record<string, unknown> }[]
>;

type Actions = Record<string, (...a: unknown[]) => Promise<unknown>>;
/** The modules of the matrix, imported statically (a dynamic path cannot be analysed). */
const MODULES: Record<string, () => Promise<unknown>> = {
  '(panel)/actions.ts': () => import('@/app/admin/(panel)/actions'),
  '(panel)/audit/actions.ts': () => import('@/app/admin/(panel)/audit/actions'),
  '(panel)/avis/actions.ts': () => import('@/app/admin/(panel)/avis/actions'),
  '(panel)/equipe/actions.ts': () => import('@/app/admin/(panel)/equipe/actions'),
  '(panel)/fiches/actions.ts': () => import('@/app/admin/(panel)/fiches/actions'),
  '(panel)/fiches/[id]/actions.ts': () => import('@/app/admin/(panel)/fiches/[id]/actions'),
  '(panel)/moderation/actions.ts': () => import('@/app/admin/(panel)/moderation/actions'),
  '(panel)/parametres/actions.ts': () => import('@/app/admin/(panel)/parametres/actions'),
  '(panel)/parametres/villes-actions.ts': () =>
    import('@/app/admin/(panel)/parametres/villes-actions'),
  '(panel)/recuperation/actions.ts': () => import('@/app/admin/(panel)/recuperation/actions'),
  '(panel)/recuperation/rapprochements/actions.ts': () =>
    import('@/app/admin/(panel)/recuperation/rapprochements/actions'),
  '(public)/espace/actions.ts': () => import('@/app/(public)/espace/actions'),
  '(public)/messages/actions.ts': () => import('@/app/(public)/messages/actions'),
  '(public)/parcours/actions.ts': () => import('@/app/(public)/parcours/actions'),
  '(public)/reponse-formation/actions.ts': () => import('@/app/(public)/reponse-formation/actions'),
};
const load = async (file: string) => {
  const m = MODULES[file];
  if (!m) throw new Error(`${file} : module absent de la table MODULES`);
  return (await m()) as Actions;
};

async function call(row: Row) {
  const mod = await load(row[0]);
  const fn = mod[row[1]];
  if (!fn) throw new Error(`${row[0]} › ${row[1]} n'existe plus`);
  return run(() => fn(...row[3]));
}
const refused = (r: unknown) => {
  const o = r as { ok?: boolean; error?: string; redirect?: string };
  return (o?.ok === false && o.error === FORBIDDEN) || o?.redirect === '/admin/login';
};

beforeAll(async () => {
  process.env.RATE_LIMIT_MULTIPLIER = '50';
  for (const role of ROLES) sessions[role] = (await adminAs(role)).cookies;
  sessions.student = (await studentAs('matrice')).cookies;
  sessions.staff = (await staffAs()).cookies;
  request.reset();
  sessions.visitor = request.snapshot();
}, 120_000);

afterAll(cleanupActors);

describe('rights matrix: static', () => {
  it('every admin action of the code is in the matrix', () => {
    const files = [...new Set(ADMIN_MATRIX.map((r) => r[0]))];
    const inCode = files.flatMap((f) =>
      [...readFileSync(`app/admin/${f}`, 'utf8').matchAll(/^export async function (\w+)/gm)].map(
        (m) => `${f} › ${m[1]}`,
      ),
    );
    const inMatrix = new Set(ADMIN_MATRIX.map((r) => `${r[0]} › ${r[1]}`));
    expect(inCode.filter((x) => !inMatrix.has(x))).toEqual([]);
  });

  it.each(ADMIN_MATRIX.filter((r) => !['moderate', 'startBulk'].includes(r[1])))(
    '%s › %s asks for %s',
    (file, name, permission) => {
      const src = readFileSync(`app/admin/${file}`, 'utf8');
      const start = src.indexOf(`export async function ${name}(`);
      const next = src.indexOf('\nexport ', start + 1);
      const body = src.slice(start, next < 0 ? undefined : next);
      expect(body).toMatch(
        new RegExp(`guard(Sensitive)?\\(\\s*'${permission.replace('.', '\\.')}'`),
      );
    },
  );
});

describe('rights matrix: each role is refused what it has no right to', () => {
  // Every role refused, and the read-only actions with the roles allowed. An allowed action that
  // writes is never run (it would act on the data): the static part checks its permission.
  const cases = [...ADMIN_MATRIX, ...DYNAMIC]
    .flatMap((row) =>
      [...ROLES, 'student', 'staff', 'visitor'].map((who) => ({
        row,
        who: who as keyof typeof sessions,
        allowed: (ROLES as string[]).includes(who) && can(who as Role, row[2]),
      })),
    )
    .filter((c) => !c.allowed || c.row[4]);
  it.each(cases)('$row.1 ($row.2) as $who', async ({ row, who, allowed }) => {
    request.restore(sessions[who]);
    const r = await call(row);
    if (allowed) expect(refused(r)).toBe(false);
    else expect(refused(r), JSON.stringify(r)).toBe(true);
  });
});

describe('student and teaching-team actions', () => {
  const STUDENT_ONLY: [string, string, unknown[]][] = [
    ['(public)/espace/actions.ts', 'deleteMyReview', [NONE]],
    ['(public)/espace/actions.ts', 'updateMyReview', [NONE, {}]],
    ['(public)/espace/actions.ts', 'updatePreference', ['notifySavedDigest', true]],
    ['(public)/espace/actions.ts', 'requestDataExport', []],
    ['(public)/espace/actions.ts', 'deleteAccount', []],
    ['(public)/espace/actions.ts', 'sendUniversityCode', [NONE, 'x@example.org']],
    ['(public)/espace/actions.ts', 'confirmUniversityCode', [NONE, '000000']],
    ['(public)/espace/actions.ts', 'reuseUniversityEmail', [NONE]],
    ['(public)/messages/actions.ts', 'replyInSpace', [NONE, 'Bonjour, merci pour votre avis.']],
    ['(public)/messages/actions.ts', 'setBlocked', [NONE, true]],
    ['(public)/messages/actions.ts', 'reportConversation', [NONE, 'spam']],
    ['(public)/parcours/actions.ts', 'setFollow', [NONE, true]],
  ];
  const callPublic = async (file: string, name: string, args: unknown[]) => {
    const mod = await load(file);
    return run(() => mod[name]!(...args));
  };
  /** Refused: sent to the login page, or an error (`{ ok: false, error }` or `{ error }`). */
  const deniedStudent = (r: unknown) => {
    const o = r as { ok?: boolean; error?: string; redirect?: string };
    return (
      o?.redirect === '/connexion' ||
      (o?.ok !== true && /session|connecte|introuvable|Seul·e/i.test(o?.error ?? ''))
    );
  };

  it.each(STUDENT_ONLY)(
    '%s › %s is refused to a visitor, an admin and a teaching team',
    async (file, name, args) => {
      for (const who of ['visitor', 'ADMIN', 'staff'] as const) {
        request.restore(sessions[who]);
        const r = await callPublic(file, name, args);
        expect(deniedStudent(r), `${who}: ${JSON.stringify(r)}`).toBe(true);
      }
    },
  );

  it('submitResponse (droit de réponse) is refused without a verified teaching-team session', async () => {
    for (const who of ['visitor', 'student', 'ADMIN'] as const) {
      request.restore(sessions[who]);
      const r = await callPublic('(public)/reponse-formation/actions.ts', 'submitResponse', [
        { reviewId: NONE, body: 'Une réponse assez longue pour passer.' },
      ]);
      expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Vérifiez/) });
    }
  });
});

describe('admin routes', () => {
  const ROUTES: [string, Permission, () => Promise<Response>][] = [
    [
      '/admin/justificatifs/[id]',
      'moderation.manage',
      async () =>
        (await import('@/app/admin/justificatifs/[id]/route')).GET(new Request('http://x'), {
          params: Promise.resolve({ id: NONE }),
        }),
    ],
    [
      '/admin/legal/[id]/export',
      'connectionLogs.view',
      async () =>
        (await import('@/app/admin/legal/[id]/export/route')).GET(new Request('http://x'), {
          params: Promise.resolve({ id: NONE }),
        }),
    ],
    [
      '/api/sync-runs/[id]',
      'dashboard.view',
      async () =>
        (await import('@/app/api/sync-runs/[id]/route')).GET(new Request('http://x'), {
          params: Promise.resolve({ id: NONE }),
        }),
    ],
  ];
  it.each(ROUTES)('%s: 403 without %s', async (_path, permission, get) => {
    for (const who of [...ROLES, 'student', 'visitor'] as const) {
      request.restore(sessions[who]);
      const allowed = (ROLES as string[]).includes(who) && can(who as Role, permission);
      const r = await get();
      if (allowed) expect(r.status, who).not.toBe(403);
      else expect(r.status, who).toBe(403);
    }
  });
});
