/**
 * Catalogue des tables présentes. Selon les plugins installés, des modules entiers manquent (le
 * lien, aujourd'hui) : chaque dépôt interroge ce catalogue avant de lire, et rend un résultat vide
 * typé au lieu de laisser la requête échouer.
 *
 * La liste est gardée en mémoire un court moment : un plugin installé apparaît sans redémarrer le
 * site, et une page ne relit pas le catalogue à chaque requête.
 */
import { sql, type Kysely } from 'kysely';

import type { Engine } from '../dialects';
import type { Database, TableName } from '../schema';

export interface TableCatalog {
  /** Vrai si toutes ces tables existent. */
  has(...tables: TableName[]): Promise<boolean>;
  /** Les noms de toutes les tables de la base, en minuscules. */
  list(): Promise<ReadonlySet<string>>;
  /** Oublie la liste gardée : la prochaine question relit la base. */
  invalidate(): void;
}

/** Seule requête propre à chaque moteur du package : il n'existe pas de catalogue portable. */
async function readTableNames(db: Kysely<Database>, engine: Engine): Promise<Set<string>> {
  const query =
    engine === 'sqlite'
      ? // Sans les tables internes de SQLite (`sqlite_sequence`…).
        sql<{
          name: string;
        }>`select name as name from sqlite_master where type = 'table' and name not like 'sqlite!_%' escape '!'`
      : engine === 'postgres'
        ? sql<{
            name: string;
          }>`select table_name as name from information_schema.tables where table_schema = any (current_schemas(false))`
        : sql<{
            name: string;
          }>`select table_name as name from information_schema.tables where table_schema = database()`;
  const { rows } = await query.execute(db);
  return new Set(rows.map((row) => String(row.name).toLowerCase()));
}

export function createTableCatalog(
  db: Kysely<Database>,
  engine: Engine,
  ttlMs: number,
  now: () => number,
): TableCatalog {
  let cached: { at: number; names: Promise<ReadonlySet<string>> } | undefined;

  function list(): Promise<ReadonlySet<string>> {
    if (cached !== undefined && now() - cached.at < ttlMs) return cached.names;
    const names = readTableNames(db, engine);
    const entry = { at: now(), names };
    cached = entry;
    // Une lecture ratée (base injoignable) n'est pas gardée : la suivante réessaie.
    names.catch(() => {
      if (cached === entry) cached = undefined;
    });
    return names;
  }

  return {
    list,
    async has(...tables) {
      const names = await list();
      return tables.every((table) => names.has(table));
    },
    invalidate() {
      cached = undefined;
    },
  };
}
