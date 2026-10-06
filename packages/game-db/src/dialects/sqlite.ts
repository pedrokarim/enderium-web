/**
 * SQLite par le module intégré `node:sqlite` (`DatabaseSync`), sans dépendance native.
 *
 * Kysely attend l'interface de better-sqlite3 : `prepare()` → `{ reader, all, run, iterate }`.
 * Cet adaptateur la fournit, et normalise les entiers : chaque requête lit les `INTEGER` en
 * `bigint` (exact), puis les rend en `number` en refusant ceux qui n'y tiennent pas.
 *
 * Le module est chargé à la demande : un site branché sur PostgreSQL ne le charge jamais.
 */
import { existsSync } from 'node:fs';
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';

import type { SqliteDatabase, SqliteStatement } from 'kysely';

import { GameDbError } from '../errors';
import { bigintToNumber } from '../internal/numbers';

export const SQLITE_MEMORY_PATH = ':memory:';

export interface SqliteOpenOptions {
  /** Ouvre le fichier sans droit d'écriture : c'est le cas de toute connexion de lecture. */
  readOnly: boolean;
  /** Attente maximale quand le serveur de jeu tient un verrou, en millisecondes. */
  busyTimeoutMs: number;
}

/** Ouvre un fichier SQLite existant. Ne crée jamais de base : un chemin faux est une erreur. */
export async function openSqlite(
  path: string,
  options: SqliteOpenOptions,
): Promise<SqliteDatabase> {
  if (path !== SQLITE_MEMORY_PATH && !existsSync(path)) {
    throw new GameDbError(`Base SQLite introuvable : ${path}`);
  }
  const { DatabaseSync: Sqlite } = await import('node:sqlite');
  let database: DatabaseSync;
  try {
    database = new Sqlite(path, { readOnly: options.readOnly });
    database.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(options.busyTimeoutMs))}`);
  } catch (cause) {
    throw new GameDbError(`Impossible d'ouvrir la base SQLite : ${path}`, { cause });
  }
  return new NodeSqliteDatabase(database);
}

class NodeSqliteDatabase implements SqliteDatabase {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  prepare(sql: string): SqliteStatement {
    return new NodeSqliteStatement(this.#database.prepare(sql));
  }

  close(): void {
    if (this.#database.isOpen) this.#database.close();
  }
}

class NodeSqliteStatement implements SqliteStatement {
  readonly reader: boolean;
  readonly #statement: StatementSync;

  constructor(statement: StatementSync) {
    statement.setReadBigInts(true);
    this.#statement = statement;
    // Une requête qui rend des colonnes est une lecture (SELECT, ou INSERT … RETURNING).
    this.reader = statement.columns().length > 0;
  }

  all(parameters: ReadonlyArray<unknown>): unknown[] {
    return this.#statement.all(...bindAll(parameters)).map(normalizeRow);
  }

  run(parameters: ReadonlyArray<unknown>): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  } {
    const { changes, lastInsertRowid } = this.#statement.run(...bindAll(parameters));
    return { changes, lastInsertRowid };
  }

  *iterate(parameters: ReadonlyArray<unknown>): IterableIterator<unknown> {
    for (const row of this.#statement.iterate(...bindAll(parameters))) {
      yield normalizeRow(row as Record<string, unknown>);
    }
  }
}

function bindAll(parameters: ReadonlyArray<unknown>): SQLInputValue[] {
  return parameters.map(bind);
}

/** `node:sqlite` n'accepte ni booléen ni `undefined` ; un entier est lié en entier exact. */
function bind(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? BigInt(value) : value;
  if (typeof value === 'string' || typeof value === 'bigint') return value;
  if (value instanceof Uint8Array) return value;
  throw new TypeError(`Paramètre SQLite non pris en charge : ${typeof value}`);
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    normalized[column] = typeof value === 'bigint' ? bigintToNumber(value, column) : value;
  }
  return normalized;
}
