/**
 * The team's contact address (CONTACT_EMAIL, required in production by lib/env.ts): Reply-To of
 * every mail, address of the legal pages, contact of the robot when CRAWLER_CONTACT_EMAIL is not
 * set. Read at request time (every page is rendered on demand), never baked into the build.
 */
const DEV_CONTACT = 'contact@notetonmaster.example';

export function contactEmail(): string {
  return process.env.CONTACT_EMAIL?.trim() || DEV_CONTACT;
}

/** Contact of the robot, shown on /a-propos#notre-robot and sent in its User-Agent. */
export function crawlerContactEmail(): string {
  return process.env.CRAWLER_CONTACT_EMAIL?.trim() || contactEmail();
}
