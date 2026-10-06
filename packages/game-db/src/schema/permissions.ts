/**
 * Tables des rôles et permissions (`perms_*`), écrites par le plugin EnderiumPermissions.
 * Sens des colonnes : `enderium-core/docs/data/permissions.md`.
 */
import type { Generated } from 'kysely';

export interface PermsGroupsTable {
  group_id: string;
  /** Clé de traduction du nom affiché. */
  display_name: string;
  weight: number;
  prefix: string;
  suffix: string;
  color: string;
  /** Booléen : 1 pour un grade d'équipe. */
  staff: number;
}

export interface PermsGroupParentsTable {
  group_id: string;
  parent_id: string;
}

export interface PermsMembersTable {
  player_uuid: string;
  group_id: string;
  /** Vide : vaut partout. */
  context: string;
  /** 0 : sans fin. */
  expires_at: number;
  /** UUID de l'auteur, `import` pour la reprise, vide pour le serveur. */
  granted_by: string;
  granted_at: number;
}

export interface PermsNodesTable {
  /** `group` ou `player`. */
  target_type: string;
  target_id: string;
  permission: string;
  /** Booléen : 1 accordée, 0 retirée. */
  value: number;
  context: string;
  expires_at: number;
}

export interface PermsMetaTable {
  target_type: string;
  target_id: string;
  meta_key: string;
  meta_value: string;
}

export interface PermsLogTable {
  id: Generated<number>;
  at: number;
  actor_uuid: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: string;
  reason: string;
}

export interface PermissionsTables {
  perms_groups: PermsGroupsTable;
  perms_group_parents: PermsGroupParentsTable;
  perms_members: PermsMembersTable;
  perms_nodes: PermsNodesTable;
  perms_meta: PermsMetaTable;
  perms_log: PermsLogTable;
}
