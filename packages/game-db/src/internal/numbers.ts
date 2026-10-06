/**
 * Conversion sûre des nombres rendus par les pilotes.
 *
 * Chaque moteur rend ses `BIGINT` à sa façon : `pg` en chaîne, `mysql2` en nombre arrondi (ou en
 * chaîne selon ses réglages), `node:sqlite` en `number` arrondi ou en `bigint`. Les dialectes
 * (`src/dialects/`) demandent tous une forme exacte, puis passent par {@link parseNumericText} ou
 * {@link bigintToNumber}. Les dépôts repassent chaque colonne par {@link toInt} : ceinture et
 * bretelles, pour qu'aucune requête ne puisse laisser filer une chaîne ou un entier arrondi.
 */
import { UnsafeIntegerError } from '../errors';

const INTEGER_TEXT = /^-?\d+$/;
/** Un `DECIMAL` sans partie fractionnaire utile (`SUM` d'un `BIGINT` sous MariaDB : `123` ou `123.000`). */
const INTEGER_DECIMAL_TEXT = /^(-?\d+)\.0+$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

/** Convertit un `bigint` en `number`, ou lève {@link UnsafeIntegerError} s'il n'y tient pas. */
export function bigintToNumber(value: bigint, column?: string): number {
  if (value > MAX_SAFE || value < MIN_SAFE) throw new UnsafeIntegerError(value.toString(), column);
  return Number(value);
}

/**
 * Lit la forme texte d'un `BIGINT` ou d'un `NUMERIC`/`DECIMAL` : entier sûr exigé pour un entier,
 * virgule flottante pour une valeur à décimales (moyenne).
 */
export function parseNumericText(text: string, column?: string): number {
  const trimmed = text.trim();
  if (INTEGER_TEXT.test(trimmed)) return bigintToNumber(BigInt(trimmed), column);
  const integerPart = INTEGER_DECIMAL_TEXT.exec(trimmed)?.[1];
  if (integerPart !== undefined) return bigintToNumber(BigInt(integerPart), column);
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) throw new TypeError(`Valeur numérique illisible : « ${text} »`);
  return parsed;
}

/**
 * Comme {@link parseNumericText}, mais rend le texte tel quel au lieu de lever une erreur. Sert là
 * où lever une exception ferait tomber la connexion (analyse des paquets de `mysql2`) : la valeur
 * reste exacte, et {@link toInt} lèvera l'erreur au moment de la lecture.
 */
export function parseNumericTextOrKeep(text: string): number | string {
  try {
    return parseNumericText(text);
  } catch {
    return text;
  }
}

/** Un entier de la base, garanti exact. */
export function toInt(value: unknown, column: string): number {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value)) return value;
    if (Number.isInteger(value)) throw new UnsafeIntegerError(String(value), column);
    throw new TypeError(`Entier attendu dans « ${column} », reçu ${value}`);
  }
  if (typeof value === 'bigint') return bigintToNumber(value, column);
  if (typeof value === 'string') {
    const parsed = parseNumericText(value, column);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new TypeError(`Entier attendu dans « ${column} », reçu ${describe(value)}`);
}

/** Un entier, ou `null` quand la colonne est `NULL`. */
export function toIntOrNull(value: unknown, column: string): number | null {
  return value === null || value === undefined ? null : toInt(value, column);
}

/** Un nombre à virgule (`DOUBLE`, moyenne). */
export function toFloat(value: unknown, column: string): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'bigint') return bigintToNumber(value, column);
  if (typeof value === 'string') return parseNumericText(value, column);
  throw new TypeError(`Nombre attendu dans « ${column} », reçu ${describe(value)}`);
}

/** Un booléen rangé en `SMALLINT` 0 ou 1. */
export function toBool(value: unknown, column: string): boolean {
  if (typeof value === 'boolean') return value;
  return toInt(value, column) !== 0;
}

/** Une chaîne « absente » (`NULL` ou vide, selon la table) devient `null`. */
export function toTextOrNull(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : value;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  return typeof value === 'string' ? `« ${value} »` : typeof value;
}
