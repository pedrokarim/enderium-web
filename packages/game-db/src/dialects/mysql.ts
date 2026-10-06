/**
 * MariaDB / MySQL par `mysql2`. Par défaut le pilote arrondit un `BIGINT` trop grand et rend les
 * `DECIMAL` (le type d'un `SUM`) en chaîne : `typeCast` lit ici le texte exact de ces colonnes et
 * le rend en `number` quand il y tient.
 *
 * Une exception levée dans `typeCast` sortirait de l'analyse des paquets et ferait tomber la
 * connexion : un entier hors de l'intervalle sûr reste donc en chaîne (exacte), et c'est `toInt`,
 * dans les dépôts, qui lève l'erreur.
 */
import { MysqlDialect, type Dialect } from 'kysely';
import type { PoolOptions as MysqlPoolOptions } from 'mysql2';

import { parseNumericTextOrKeep } from '../internal/numbers';
import type { PoolOptions } from './postgres';

const EXACT_NUMERIC_TYPES = new Set(['LONGLONG', 'NEWDECIMAL', 'DECIMAL']);

const typeCast: NonNullable<MysqlPoolOptions['typeCast']> = (field, next) => {
  if (!EXACT_NUMERIC_TYPES.has(field.type)) return next();
  const text = field.string();
  return text === null ? null : parseNumericTextOrKeep(text);
};

export function createMysqlDialect(uri: string, options: PoolOptions): Dialect {
  return new MysqlDialect({
    pool: async () => {
      const { createPool } = await import('mysql2');
      return createPool({
        uri,
        connectionLimit: options.max,
        waitForConnections: true,
        queueLimit: 0,
        connectTimeout: 10_000,
        enableKeepAlive: true,
        charset: 'utf8mb4',
        supportBigNumbers: true,
        bigNumberStrings: true,
        typeCast,
      });
    },
  });
}
