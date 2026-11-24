import type { AdminRole } from '@/lib/db/generated/enums';

export const PERMISSIONS = [
  'dashboard.view',
  'moderation.manage',
  'data.edit',
  'sync.run',
  'sync.validate',
  'legal.manage',
  'connectionLogs.view',
  'team.manage',
  'audit.export',
  'articles.edit',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABEL: Record<Permission, string> = {
  'dashboard.view': 'Voir le tableau de bord',
  'moderation.manage': 'Modérer avis, justificatifs, messages',
  'data.edit': 'Modifier les fiches, arbitrer les conflits',
  'sync.run': 'Lancer une synchronisation',
  'sync.validate': 'Valider une simulation et appliquer un import',
  'legal.manage': 'Traiter une demande légale',
  'connectionLogs.view': 'Accéder aux données de connexion',
  'team.manage': 'Gérer l’équipe et les paramètres',
  'audit.export': 'Exporter le journal d’audit',
  'articles.edit': 'Rédiger, publier et dépublier les guides',
};

/** Permission matrix. */
const MATRIX: Record<AdminRole, readonly Permission[]> = {
  ADMIN: [
    'dashboard.view',
    'moderation.manage',
    'data.edit',
    'sync.run',
    'sync.validate',
    'legal.manage',
    'team.manage',
    'audit.export',
    'articles.edit',
  ],
  MODERATOR: ['dashboard.view', 'moderation.manage'],
  DATA_EDITOR: ['dashboard.view', 'data.edit', 'sync.run', 'sync.validate', 'articles.edit'],
  LEGAL: ['dashboard.view', 'legal.manage', 'connectionLogs.view', 'audit.export'],
};

export function can(role: AdminRole, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export const ROLES: AdminRole[] = ['ADMIN', 'MODERATOR', 'DATA_EDITOR', 'LEGAL'];

export const ROLE_LABEL: Record<AdminRole, string> = {
  ADMIN: 'Admin',
  MODERATOR: 'Modération',
  DATA_EDITOR: 'Données',
  LEGAL: 'Légal',
};

export const ROLE_HELP: Record<AdminRole, string> = {
  MODERATOR: 'Valide, refuse et masque les avis. Traite les signalements.',
  DATA_EDITOR:
    'Modifie les fiches, lance les synchronisations, arbitre les conflits, rédige les guides.',
  LEGAL: 'Traite les demandes de retrait et les réquisitions. Seul accès aux données de connexion.',
  ADMIN: 'Tous les droits, dont la gestion de l’équipe et des paramètres.',
};
