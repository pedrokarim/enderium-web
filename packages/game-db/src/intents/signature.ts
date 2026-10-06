/**
 * Signature d'une intention (`docs/contracts/intents.md`, § 3) :
 *
 *     message   = "v1" \n id \n idempotency_key \n kind \n target_server \n actor_id \n
 *                 actor_uuid \n created_at \n expires_at \n reason \n payload
 *     signature = hex( HMAC-SHA256( secret, UTF-8(message) ) )
 *
 * Le plugin EnderiumLink calcule la même chose de son côté ; les deux ont un essai sur le vecteur
 * du contrat. Toute évolution se décide au contrat d'abord.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Les champs signés, dans leur forme écrite en base. */
export interface IntentSignatureFields {
  id: string;
  idempotencyKey: string;
  kind: string;
  /** `''` : n'importe quel serveur. */
  targetServer: string;
  actorId: string;
  /** `''` : l'auteur n'a pas de compte Minecraft lié. */
  actorUuid: string;
  createdAt: number;
  expiresAt: number;
  reason: string;
  /** La chaîne JSON exacte écrite en base. */
  payload: string;
}

const SIGNATURE_VERSION = 'v1';

/** Le message signé. `payload` est en dernier : ses retours à la ligne ne changent pas le découpage. */
export function intentSigningMessage(fields: IntentSignatureFields): string {
  return [
    SIGNATURE_VERSION,
    fields.id,
    fields.idempotencyKey,
    fields.kind,
    fields.targetServer,
    fields.actorId,
    fields.actorUuid,
    String(fields.createdAt),
    String(fields.expiresAt),
    fields.reason,
    fields.payload,
  ].join('\n');
}

/** HMAC-SHA256 du message, en hexadécimal minuscule. */
export function signIntent(fields: IntentSignatureFields, secret: string): string {
  return createHmac('sha256', secret).update(intentSigningMessage(fields), 'utf8').digest('hex');
}

/** Vérifie une signature, à temps constant. */
export function verifyIntentSignature(
  fields: IntentSignatureFields,
  signature: string,
  secret: string,
): boolean {
  const expected = Buffer.from(signIntent(fields, secret), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
