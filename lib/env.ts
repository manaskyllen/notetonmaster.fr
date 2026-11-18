/**
 * Environment checked at startup (instrumentation.ts for the site, worker/index.ts). In
 * production the server refuses to start when a variable is missing, still has a development,
 * demo or test value, or switches a protection off.
 *
 * Local production builds (make prod-up, make prod-local, CI e2e) run with demo data, mock
 * Turnstile and an http address: they set ALLOW_INSECURE_LOCAL_PROD=1, which is only accepted
 * when APP_URL points to the machine itself (localhost, 127.0.0.1, a compose service name).
 */
import { z } from 'zod';

type Env = Record<string, string | undefined>;

/** Values published in this repository (.env.example, workflows, demo): never a real secret. */
const KNOWN_SESSION_SECRETS = [/^dev-only/, /^ci-only/, /change-me/i];
const KNOWN_ENCRYPTION_KEYS = new Set(['ZGV2LW9ubHkta2V5LWNoYW5nZS1tZS0zMi1ieXRlcyE=']);
/** Cloudflare's official Turnstile test keys (always pass, always fail, already spent…). */
const TURNSTILE_TEST_KEY = /^[123]x0{20,}(AA|AB|FF)$/;

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|web|app|nm-prodlocal)$/;

function isLocalUrl(url: string | undefined): boolean {
  try {
    return LOCAL_HOSTS.test(new URL(url ?? '').hostname);
  } catch {
    return false;
  }
}

const base = z.object({
  APP_URL: z.string().url({ error: 'APP_URL doit être une adresse complète' }),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL manque'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit faire au moins 32 caractères'),
  APP_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
    error: 'APP_ENCRYPTION_KEY doit faire 32 octets encodés en base64',
  }),
});

export function validateEnv(env: Env = process.env): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const k of Object.keys(env))
    if (/^NEXT_PUBLIC_.*(SECRET|PASSWORD|PASS|TOKEN|KEY_PRIVATE|ENCRYPTION|DATABASE)/i.test(k))
      errors.push(`${k} : une variable NEXT_PUBLIC_ est envoyée au navigateur, jamais un secret`);

  if (env.NODE_ENV !== 'production') return { ok: errors.length === 0, errors };

  const local = env.ALLOW_INSECURE_LOCAL_PROD === '1';
  if (local && !isLocalUrl(env.APP_URL))
    errors.push('ALLOW_INSECURE_LOCAL_PROD ne sert qu’à un build local : APP_URL doit être locale');

  const parsed = base.safeParse(env);
  if (!parsed.success)
    for (const i of parsed.error.issues) errors.push(`${String(i.path[0])} : ${i.message}`);

  if (local) return { ok: errors.length === 0, errors };

  // A real deployment.
  if (!(env.APP_URL ?? '').startsWith('https://')) errors.push('APP_URL : https:// obligatoire');
  if (env.SESSION_SECRET && KNOWN_SESSION_SECRETS.some((re) => re.test(env.SESSION_SECRET!)))
    errors.push('SESSION_SECRET : valeur de développement, à régénérer (openssl rand -base64 48)');
  if (env.APP_ENCRYPTION_KEY && KNOWN_ENCRYPTION_KEYS.has(env.APP_ENCRYPTION_KEY))
    errors.push(
      'APP_ENCRYPTION_KEY : valeur de développement, à régénérer (openssl rand -base64 32)',
    );
  if (env.TURNSTILE_MODE !== 'live')
    errors.push('TURNSTILE_MODE : « live » obligatoire en production');
  for (const k of ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'] as const) {
    if (!env[k]) errors.push(`${k} manque`);
    else if (TURNSTILE_TEST_KEY.test(env[k]!)) errors.push(`${k} : clé de test Cloudflare refusée`);
  }
  if (!env.SMTP_HOST || env.SMTP_HOST === 'mailpit')
    errors.push('SMTP_HOST : serveur de mail réel obligatoire');
  if (!env.MAIL_FROM) errors.push('MAIL_FROM manque');
  if (env.CONNECTORS_MODE === 'mock')
    errors.push('CONNECTORS_MODE : « mock » interdit en production');
  if (env.SEED_ON_START === 'true') errors.push('SEED_ON_START : interdit en production');
  if (env.DEMO_DATA && env.DEMO_DATA !== 'false') errors.push('DEMO_DATA : interdit en production');
  if (env.RATE_LIMIT_MULTIPLIER && Number(env.RATE_LIMIT_MULTIPLIER) !== 1)
    errors.push('RATE_LIMIT_MULTIPLIER : les limites de débit réelles (1) en production');
  if (env.TRUSTED_PROXY_HOPS && !/^[1-9]$/.test(env.TRUSTED_PROXY_HOPS))
    errors.push('TRUSTED_PROXY_HOPS : un entier de 1 à 9');
  return { ok: errors.length === 0, errors };
}

/** True for a production build run on the machine itself (make prod-up, CI). */
export function isInsecureLocalProd(env: Env = process.env): boolean {
  return env.ALLOW_INSECURE_LOCAL_PROD === '1' && isLocalUrl(env.APP_URL);
}

/** Throws (the process does not start) when the environment is not valid. */
export function assertEnv(env: Env = process.env) {
  const r = validateEnv(env);
  if (!r.ok)
    throw new Error(
      `Configuration refusée, le serveur ne démarre pas :\n- ${r.errors.join('\n- ')}`,
    );
}
