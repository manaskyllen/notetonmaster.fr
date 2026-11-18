import { test as setup, type Page } from '@playwright/test';
import { ADMIN, DEMO_STUDENT, MODERATOR, loginAdmin, loginStudent, saveSession } from './helpers';
import { pinServer, SERVERS, serverUrl } from './stack';

/**
 * Project `setup`: the demo student and the two admins that can log in (Admin, Modération) log in
 * once per server, through the screens (code by mail, password and TOTP), and their sessions are
 * saved in tests/e2e/.auth/<server>/. The tests then start from these cookies (helpers.ts
 * loginStudent / loginAdmin). Visitors need no session; the teaching teams log in with a one-time
 * code per reply, and the Données and Légal demo admins are not set up yet (first login, invitation).
 */
const PROFILES: [email: string, login: (page: Page) => Promise<void>][] = [
  [DEMO_STUDENT, (page) => loginStudent(page, DEMO_STUDENT, { fresh: true })],
  [ADMIN.email, (page) => loginAdmin(page, ADMIN, { fresh: true })],
  [MODERATOR.email, (page) => loginAdmin(page, MODERATOR, { fresh: true })],
];

setup.describe.configure({ mode: 'parallel' });

for (let server = 0; server < Math.max(SERVERS, 1); server++) {
  setup(`sessions of server ${server}`, async ({ browser }) => {
    pinServer(server);
    try {
      for (const [email, login] of PROFILES) {
        const context = await browser.newContext({
          baseURL: serverUrl(server),
          locale: 'fr-FR',
          timezoneId: 'Europe/Paris',
        });
        const page = await context.newPage();
        await login(page);
        await saveSession(page, email);
        await context.close();
      }
    } finally {
      pinServer(null);
    }
  });
}
