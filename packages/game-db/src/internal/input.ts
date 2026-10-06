/**
 * Validation des entrées : tout ce qui vient de l'appelant (donc, au bout de la chaîne, d'une URL
 * ou d'un formulaire) passe par un schéma zod avant d'approcher une requête. Les valeurs ne sont
 * jamais concaténées dans du SQL : Kysely les lie en paramètres.
 */
import { z } from 'zod';

import { InvalidInputError } from '../errors';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** L'UUID nul : l'acteur « serveur » dans certains journaux. */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Un UUID de joueur : rendu en minuscules avec tirets, comme en base. */
export const uuidSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(UUID_PATTERN, 'UUID attendu, en 8-4-4-4-12 chiffres hexadécimaux');

/** Vrai si la chaîne a la forme d'un UUID (casse indifférente). */
export function looksLikeUuid(text: string): boolean {
  return UUID_PATTERN.test(text.trim().toLowerCase());
}

/** Une date en millisecondes UTC. */
export const timestampSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Un identifiant court sans caractère de contrôle (type d'action, monde, zone, groupe…). */
export function identifierSchema(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .regex(/^[^\p{Cc}]*$/u, 'Caractère de contrôle interdit');
}

/** Bornes de temps communes aux journaux : `from` inclus, `to` exclu. */
export const timeRangeShape = {
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
};

/** Valide `input` et rend sa forme normalisée, ou lève {@link InvalidInputError}. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
  what: string,
): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new InvalidInputError(
    `${what} : ${result.error.issues.map(formatIssue).join(' ; ')}`,
    result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
  );
}

export function formatIssue(issue: { path: ReadonlyArray<PropertyKey>; message: string }): string {
  return issue.path.length === 0
    ? issue.message
    : `${issue.path.map(String).join('.')} – ${issue.message}`;
}
