/**
 * Vocabulaire des permissions de la console.
 *
 * Ces clés sont déclarées telles quelles dans l'application « Enderium » côté
 * Ascencia ID (voir `ascencia.manifest.json` à la racine du dépôt et
 * `docs/auth.md`). Le site ne connaît que cette liste : une permission
 * inconnue reçue dans un jeton est ignorée.
 */

import { evaluate } from '@ascencia/id-core';

export const CONSOLE_PERMISSIONS = [
  'console.access',
  'players.read',
  'economy.read',
  'economy.write',
  'permissions.read',
  'permissions.write',
  'regions.read',
  'moderation.read',
  'journal.read',
  'studio.access',
] as const;

export type ConsolePermission = (typeof CONSOLE_PERMISSIONS)[number];

/** Le droit d'entrer dans la console : sans lui, aucun droit de la console ne compte. */
export const CONSOLE_GATE: ConsolePermission = 'console.access';

/**
 * Les permissions qui vivent hors de la console et ne dépendent donc pas de
 * `console.access`.
 */
const STANDALONE_PERMISSIONS: ReadonlySet<ConsolePermission> = new Set(['studio.access']);

const KNOWN: ReadonlySet<string> = new Set(CONSOLE_PERMISSIONS);

export function isConsolePermission(value: unknown): value is ConsolePermission {
  return typeof value === 'string' && KNOWN.has(value);
}

/** Ce qu'Ascencia ID donne : des motifs autorisés (`economy.*`, `*`) et des refus explicites. */
export interface GrantedPatterns {
  readonly allow: readonly string[];
  readonly deny?: readonly string[];
}

/**
 * Traduit les motifs d'Ascencia ID en permissions de la console.
 *
 * Le calcul passe par `evaluate` du SDK : c'est la même fonction que côté
 * fournisseur, donc `economy.*` ou `*` valent ici exactement ce qu'ils valent
 * là-bas, et un refus explicite l'emporte toujours.
 *
 * Deux garde-fous propres au site :
 *   – seules les dix clés connues sortent d'ici, jamais un motif brut ;
 *   – sans `console.access`, les droits de la console sont retirés. Un rôle mal
 *     composé (`economy.write` seul) ne donne donc rien.
 */
export function resolveConsolePermissions(granted: GrantedPatterns): ConsolePermission[] {
  const allow = granted.allow.filter((pattern) => typeof pattern === 'string');
  const deny = (granted.deny ?? []).filter((pattern) => typeof pattern === 'string');

  const held = CONSOLE_PERMISSIONS.filter((permission) => evaluate({ allow, deny }, permission));
  if (held.includes(CONSOLE_GATE)) return held;
  return held.filter((permission) => STANDALONE_PERMISSIONS.has(permission));
}

/** Profils du mode développement (connexion locale, hors production). */
export const DEV_PROFILES = {
  full: {
    label: 'Tous les droits',
    roles: ['owner'],
    permissions: [...CONSOLE_PERMISSIONS],
  },
  'read-only': {
    label: 'Lecture seule',
    roles: ['support'],
    permissions: CONSOLE_PERMISSIONS.filter(
      (permission) => permission.endsWith('.read') || permission === CONSOLE_GATE,
    ),
  },
} as const satisfies Record<
  string,
  { label: string; roles: readonly string[]; permissions: readonly ConsolePermission[] }
>;

export type DevProfileId = keyof typeof DEV_PROFILES;

export function isDevProfileId(value: unknown): value is DevProfileId {
  return typeof value === 'string' && Object.hasOwn(DEV_PROFILES, value);
}
