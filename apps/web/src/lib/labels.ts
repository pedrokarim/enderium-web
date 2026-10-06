import type { Tone } from '@enderium/ui';

/**
 * Libellés français des valeurs techniques stockées en base. Une valeur
 * inconnue (ajoutée par un plugin plus récent que le site) s'affiche telle
 * quelle : mieux vaut un code lisible qu'un trou.
 */

interface Described {
  label: string;
  tone: Tone;
}

function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

// --- Économie ---------------------------------------------------------------

const LEDGER_KINDS: Readonly<Record<string, string>> = {
  admin: 'Intervention de l’équipe',
  site: 'Action depuis le site',
  pay: 'Paiement entre joueurs',
  trade: 'Échange entre joueurs',
  vault: 'Autre plugin (interface standard)',
  boss: 'Prime de boss',
  bounty: 'Prime de chasse',
  quest: 'Récompense de quête',
  daily_order: 'Commande du jour',
  server_order: 'Commande du serveur',
  crate: 'Boîte à ouvrir',
  coin_deposit: 'Dépôt de pièces',
  shop_buy: 'Achat à la boutique',
  shop_sell: 'Vente à la boutique',
  token_shop: 'Jetons de la semaine',
  wardrobes: 'Garde-robe',
  market_fee: 'Commission de l’hôtel des ventes',
  rune_dust: 'Poussière de rune',
  forge_reforge: 'Reforge',
  forge_machine_level: 'Niveau de machine',
};

export function ledgerKindLabel(kind: string): string {
  return lookup(LEDGER_KINDS, kind) ?? kind;
}

// --- Intentions (actions déposées par le site) --------------------------------

const INTENT_STATUSES: Readonly<Record<string, Described>> = {
  pending: { label: 'En attente', tone: 'info' },
  running: { label: 'En cours', tone: 'info' },
  done: { label: 'Faite', tone: 'success' },
  refused: { label: 'Refusée', tone: 'warning' },
  failed: { label: 'Échouée', tone: 'danger' },
  expired: { label: 'Expirée', tone: 'neutral' },
};

export function intentStatus(status: string): Described {
  return lookup(INTENT_STATUSES, status) ?? { label: status, tone: 'neutral' };
}

const INTENT_KINDS: Readonly<Record<string, string>> = {
  'perms.member.add': 'Donner un grade',
  'perms.member.remove': 'Retirer un grade',
  'economy.deposit': 'Créditer un compte',
  'economy.withdraw': 'Débiter un compte',
};

export function intentKindLabel(kind: string): string {
  return lookup(INTENT_KINDS, kind) ?? kind;
}

const RESULT_CODES: Readonly<Record<string, string>> = {
  ok: 'Exécutée',
  bad_signature: 'Signature refusée par le serveur',
  unknown_kind: 'Action inconnue du serveur',
  invalid_payload: 'Paramètres refusés par le serveur',
  module_absent: 'Module absent du serveur',
  interrupted: 'Interrompue par un redémarrage',
  internal_error: 'Erreur interne du serveur',
  unknown_group: 'Grade inconnu',
  unknown_player: 'Joueur inconnu',
  not_member: 'Le joueur n’a pas ce grade',
  unknown_account: 'Compte inconnu',
  insufficient_funds: 'Solde insuffisant',
};

export function resultCodeLabel(code: string): string {
  return lookup(RESULT_CODES, code) ?? code;
}

// --- Permissions --------------------------------------------------------------

const PERMISSION_ACTIONS: Readonly<Record<string, string>> = {
  import: 'Reprise des anciens grades',
  'group.create': 'Grade créé',
  'group.delete': 'Grade supprimé',
  'group.permission': 'Droit d’un grade modifié',
  'group.meta': 'Réglage d’un grade modifié',
  'group.parents': 'Héritage modifié',
  'group.weight': 'Poids modifié',
  'member.add': 'Grade donné',
  'member.set': 'Grade remplacé',
  'member.remove': 'Grade retiré',
  'member.expire': 'Grade arrivé à échéance',
  'node.add': 'Droit ajouté',
  'node.remove': 'Droit retiré',
};

export function permissionActionLabel(action: string): string {
  return lookup(PERMISSION_ACTIONS, action) ?? action;
}

/** Les codes d'action connus du site, pour proposer un filtre du journal. */
export function permissionActionCodes(): string[] {
  return Object.keys(PERMISSION_ACTIONS);
}

// --- Zones --------------------------------------------------------------------

const REGION_ACTIONS: Readonly<Record<string, string>> = {
  create: 'Zone créée',
  delete: 'Zone supprimée',
  redefine: 'Contour redéfini',
  flag: 'Drapeau modifié',
  'member.add': 'Membre ajouté',
  'member.remove': 'Membre retiré',
  owner: 'Propriétaire modifié',
  parent: 'Zone parente modifiée',
  priority: 'Priorité modifiée',
};

export function regionActionLabel(action: string): string {
  return lookup(REGION_ACTIONS, action) ?? action;
}

const REGION_SHAPES: Readonly<Record<string, string>> = {
  cuboid: 'Pavé',
  chunk: 'Tronçons',
  polygon: 'Polygone',
  global: 'Monde entier',
};

export function regionShapeLabel(shape: string): string {
  return lookup(REGION_SHAPES, shape) ?? shape;
}

const FLAG_VALUES: Readonly<Record<string, Described>> = {
  allow: { label: 'Autorisé', tone: 'success' },
  deny: { label: 'Interdit', tone: 'danger' },
};

/** Un drapeau à valeur libre (message d'entrée, par exemple) reste neutre. */
export function flagValue(value: string): Described {
  return lookup(FLAG_VALUES, value) ?? { label: value, tone: 'neutral' };
}

const ZONE_MEMBER_TYPES: Readonly<Record<string, string>> = {
  player: 'Joueur',
  group: 'Grade',
  faction: 'Faction',
  coop: 'Coopérative',
};

export function zoneMemberTypeLabel(type: string): string {
  return lookup(ZONE_MEMBER_TYPES, type) ?? type;
}

const ZONE_ROLES: Readonly<Record<string, string>> = {
  owner: 'Propriétaire',
  manager: 'Gestionnaire',
  member: 'Membre',
  worker: 'Ouvrier',
  visitor: 'Visiteur',
};

export function zoneRoleLabel(role: string): string {
  return lookup(ZONE_ROLES, role) ?? role;
}

// --- Joueurs ------------------------------------------------------------------

const GAME_MODES: Readonly<Record<string, string>> = {
  SURVIVAL: 'Survie',
  CREATIVE: 'Créatif',
  ADVENTURE: 'Aventure',
  SPECTATOR: 'Spectateur',
};

export function gameModeLabel(mode: string): string {
  return lookup(GAME_MODES, mode) ?? (mode || '–');
}

/** L'UUID nul désigne le serveur lui-même dans les journaux. */
export const SERVER_ACTOR_UUID = '00000000-0000-0000-0000-000000000000';
