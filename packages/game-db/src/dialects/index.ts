/**
 * Ouvre la base à partir de son URL : `sqlite:<chemin>`, `postgres://…` ou `mysql://…`.
 * Tout ce qui dépend du moteur vit dans ce dossier ; le reste du package parle à Kysely.
 */
import { isAbsolute, resolve } from 'node:path';

import { Kysely, SqliteDialect } from 'kysely';

import { GameDbConfigError } from '../errors';
import type { Database } from '../schema';
import { createMysqlDialect } from './mysql';
import { createPostgresDialect } from './postgres';
import { SQLITE_MEMORY_PATH, openSqlite } from './sqlite';

export type Engine = 'sqlite' | 'postgres' | 'mysql';

export interface ConnectionOptions {
  /** Taille du pool (PostgreSQL, MariaDB). */
  poolSize: number;
  /** Attente d'un verrou SQLite, en millisecondes. */
  sqliteBusyTimeoutMs: number;
}

/** La base ouverte : une connexion de lecture, et de quoi écrire les intentions. */
export interface Connection {
  readonly engine: Engine;
  /** Connexion de lecture. En SQLite, le fichier est ouvert en lecture seule. */
  readonly db: Kysely<Database>;
  /**
   * Exécute `work` sur une connexion qui a le droit d'écrire. PostgreSQL et MariaDB : le même
   * pool (les droits sont ceux du compte). SQLite : une connexion d'écriture ouverte pour
   * l'occasion, puis refermée.
   */
  withWriter<T>(work: (db: Kysely<Database>) => Promise<T>): Promise<T>;
  destroy(): Promise<void>;
}

/** Reconnaît le moteur d'une URL, sans rien ouvrir. */
export function engineOf(url: string): Engine {
  const scheme = /^([a-z][a-z0-9+]*):/i.exec(url.trim())?.[1]?.toLowerCase();
  switch (scheme) {
    case 'sqlite':
      return 'sqlite';
    case 'postgres':
    case 'postgresql':
      return 'postgres';
    case 'mysql':
    case 'mariadb':
      return 'mysql';
    default:
      throw new GameDbConfigError(
        'URL de base inconnue : attendu « sqlite:<chemin> », « postgres://… » ou « mysql://… ».',
      );
  }
}

/** Le chemin du fichier d'une URL `sqlite:` ; un chemin relatif part du dossier courant. */
export function sqlitePathOf(url: string): string {
  let path = url.trim().replace(/^sqlite:/i, '');
  if (path.startsWith('//')) path = path.slice(2);
  if (path === '')
    throw new GameDbConfigError('URL SQLite sans chemin : attendu « sqlite:<chemin> ».');
  if (path === SQLITE_MEMORY_PATH) return path;
  return isAbsolute(path) ? path : resolve(/* turbopackIgnore: true */ process.cwd(), path);
}

export function openConnection(url: string, options: ConnectionOptions): Connection {
  const engine = engineOf(url);
  if (engine === 'sqlite') return openSqliteConnection(sqlitePathOf(url), options);

  const dialect =
    engine === 'postgres'
      ? createPostgresDialect(url.trim(), { max: options.poolSize })
      : createMysqlDialect(url.trim().replace(/^mariadb:/i, 'mysql:'), { max: options.poolSize });
  const db = new Kysely<Database>({ dialect });
  return {
    engine,
    db,
    withWriter: (work) => work(db),
    destroy: () => db.destroy(),
  };
}

function openSqliteConnection(path: string, options: ConnectionOptions): Connection {
  const busyTimeoutMs = options.sqliteBusyTimeoutMs;

  if (path === SQLITE_MEMORY_PATH) {
    // Une base en mémoire n'existe que dans sa connexion : une seule, en écriture (essais).
    const db = new Kysely<Database>({
      dialect: new SqliteDialect({
        database: () => openSqlite(path, { readOnly: false, busyTimeoutMs }),
      }),
    });
    return { engine: 'sqlite', db, withWriter: (work) => work(db), destroy: () => db.destroy() };
  }

  const db = new Kysely<Database>({
    dialect: new SqliteDialect({
      database: () => openSqlite(path, { readOnly: true, busyTimeoutMs }),
    }),
  });
  return {
    engine: 'sqlite',
    db,
    async withWriter(work) {
      const writer = new Kysely<Database>({
        dialect: new SqliteDialect({
          database: () => openSqlite(path, { readOnly: false, busyTimeoutMs }),
        }),
      });
      try {
        return await work(writer);
      } finally {
        await writer.destroy();
      }
    },
    destroy: () => db.destroy(),
  };
}
