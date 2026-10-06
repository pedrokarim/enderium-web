/**
 * Registre des actions que le site peut demander au serveur (`docs/contracts/intents.md`, § 5).
 *
 * Ajouter une action : l'écrire d'abord au contrat, puis ajouter ici son `kind` et le schéma de
 * son `payload`, et enregistrer son exécuteur dans le plugin EnderiumLink.
 *
 * Les schémas sont stricts (une clé inconnue est refusée) et l'ordre de leurs clés est celui du
 * JSON signé : le serveur vérifie la signature sur la chaîne exacte écrite en base.
 */
import { z } from 'zod';

import { InvalidIntentError } from '../errors';
import { formatIssue, uuidSchema } from '../internal/input';

/** Montant : entier strictement positif, dans la plus petite unité de la monnaie. */
const amountSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** Identifiant de groupe, en minuscules (`admin`, `resp-modo`). */
const groupIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/, 'Identifiant de groupe en minuscules attendu');
/** Date de fin en millisecondes, `0` pour sans fin. */
const expiresAtSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const INTENT_PAYLOAD_SCHEMAS = {
  'perms.member.add': z.strictObject({
    playerUuid: uuidSchema,
    groupId: groupIdSchema,
    expiresAt: expiresAtSchema,
  }),
  'perms.member.remove': z.strictObject({
    playerUuid: uuidSchema,
    groupId: groupIdSchema,
  }),
  'economy.deposit': z.strictObject({
    playerUuid: uuidSchema,
    amount: amountSchema,
  }),
  'economy.withdraw': z.strictObject({
    playerUuid: uuidSchema,
    amount: amountSchema,
  }),
} as const;

export type IntentKind = keyof typeof INTENT_PAYLOAD_SCHEMAS;

/** Le `payload` de chaque action, tel qu'il est écrit en base. */
export type IntentPayloads = { [K in IntentKind]: z.output<(typeof INTENT_PAYLOAD_SCHEMAS)[K]> };

export const INTENT_KINDS = Object.keys(INTENT_PAYLOAD_SCHEMAS) as IntentKind[];

export function isIntentKind(kind: unknown): kind is IntentKind {
  return typeof kind === 'string' && Object.hasOwn(INTENT_PAYLOAD_SCHEMAS, kind);
}

/** Un `payload` validé et sa forme JSON, celle qui est signée puis écrite. */
export interface SerializedPayload<K extends IntentKind = IntentKind> {
  payload: IntentPayloads[K];
  json: string;
}

/**
 * Valide le `payload` d'une action et le sérialise, clés dans l'ordre du contrat.
 * Lève {@link InvalidIntentError} si le `kind` est inconnu ou le `payload` invalide.
 */
export function serializeIntentPayload<K extends IntentKind>(
  kind: K,
  payload: unknown,
): SerializedPayload<K>;
export function serializeIntentPayload(kind: unknown, payload: unknown): SerializedPayload;
export function serializeIntentPayload(kind: unknown, payload: unknown): SerializedPayload {
  if (!isIntentKind(kind)) {
    throw new InvalidIntentError(`Action inconnue : ${String(kind)}`, [
      { path: ['kind'], message: 'Action inconnue' },
    ]);
  }
  const schema: z.ZodObject = INTENT_PAYLOAD_SCHEMAS[kind];
  const result = schema.safeParse(payload);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: ['payload', ...issue.path],
      message: issue.message,
    }));
    throw new InvalidIntentError(
      `Payload invalide pour « ${kind} » : ${issues.map(formatIssue).join(' ; ')}`,
      issues,
    );
  }
  const parsed = result.data as Record<string, unknown>;
  const ordered = Object.fromEntries(Object.keys(schema.shape).map((key) => [key, parsed[key]]));
  return { payload: ordered as IntentPayloads[IntentKind], json: JSON.stringify(ordered) };
}
