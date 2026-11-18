/**
 * Forms protected by Cloudflare Turnstile. The id is also the Turnstile `action`
 * checked by the server (32 characters at most, letters, digits, - and _).
 * Pure module: shared by the client widget, the server check, the admin settings and tests.
 */
export const TURNSTILE_FORMS = [
  { id: 'review', label: 'Avis (étape 3)' },
  { id: 'question', label: 'Question à un auteur' },
  { id: 'contact', label: 'Contact (À propos)' },
  { id: 'report', label: 'Signalement d’un avis' },
  { id: 'notice', label: 'Notification de contenu illicite' },
  { id: 'login', label: 'Demande de lien de connexion' },
  { id: 'email-change', label: 'Changement d’adresse mail' },
  { id: 'university-code', label: 'Code de vérification universitaire' },
  { id: 'staff-code', label: 'Droit de réponse : code de l’équipe pédagogique' },
  { id: 'public-question', label: 'Question publique sur un master' },
  { id: 'admin-login', label: 'Connexion admin' },
] as const;

export type TurnstileForm = (typeof TURNSTILE_FORMS)[number]['id'];

/** Token accepted by the mock verifier (dev, tests, CI). Any other token fails, e.g. "fail". */
export const TURNSTILE_MOCK_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
