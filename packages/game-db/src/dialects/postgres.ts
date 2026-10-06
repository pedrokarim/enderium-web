/**
 * PostgreSQL par `pg`. Le pilote rend les `int8` (20) et les `numeric` (1700 : c'est le type d'un
 * `SUM` de `BIGINT`) en chaîne ; on les lit ici en `number`, en refusant un entier hors de
 * l'intervalle sûr. `pg` attrape l'erreur d'un analyseur de type et fait échouer la requête.
 *
 * Le réglage est porté par le pool de ce package, pas par l'état global de `pg`.
 */
import { PostgresDialect, type Dialect } from 'kysely';

import { parseNumericText } from '../internal/numbers';

const INT8_OID = 20;
const NUMERIC_OID = 1700;

export interface PoolOptions {
  /** Connexions simultanées au plus. */
  max: number;
}

export function createPostgresDialect(connectionString: string, options: PoolOptions): Dialect {
  return new PostgresDialect({
    pool: async () => {
      const { Pool, types } = await import('pg');
      const readNumeric = (text: string): number => parseNumericText(text);
      const getTypeParser = ((oid: number, format?: 'text' | 'binary') =>
        format !== 'binary' && (oid === INT8_OID || oid === NUMERIC_OID)
          ? readNumeric
          : types.getTypeParser(oid, format as 'text')) as typeof types.getTypeParser;

      const pool = new Pool({
        connectionString,
        max: options.max,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        application_name: 'enderium-web',
        types: { getTypeParser },
      });
      // Une connexion inactive qui tombe émet « error » sur le pool : sans écouteur, Node s'arrête.
      pool.on('error', () => {});
      return pool;
    },
  });
}
