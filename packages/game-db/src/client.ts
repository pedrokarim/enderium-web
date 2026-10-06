/**
 * Point d'entrée : ouvre la base d'Enderium et rend ses dépôts.
 *
 * Tout est en lecture, sauf `link.intents.enqueue`, qui insère une intention. À n'utiliser que côté
 * serveur (composants serveur, actions serveur, routes).
 */
import { openConnection, type Engine } from './dialects';
import { createEconomyRepository, type EconomyRepository } from './economy/repository';
import { GameDbConfigError } from './errors';
import type { DbContext } from './internal/context';
import { LINK_SECRET_ENV } from './link/constants';
import { createLinkRepository, type LinkRepository } from './link/repository';
import { createMetaRepository, type MetaRepository } from './meta/repository';
import { createTableCatalog } from './meta/tables';
import { createModerationRepository, type ModerationRepository } from './moderation/repository';
import { createPermissionsRepository, type PermissionsRepository } from './permissions/repository';
import { createPlayersRepository, type PlayersRepository } from './players/repository';
import { createProgressionRepository, type ProgressionRepository } from './progression/repository';
import { createRegionsRepository, type RegionsRepository } from './regions/repository';

export interface GameDb {
  /** Le moteur derrière l'URL. */
  readonly engine: Engine;
  /** État de la base : tables et modules présents, versions du schéma. */
  readonly meta: MetaRepository;
  readonly players: PlayersRepository;
  readonly economy: EconomyRepository;
  readonly permissions: PermissionsRepository;
  readonly regions: RegionsRepository;
  readonly moderation: ModerationRepository;
  /** La progression d'un joueur, pour sa fiche. */
  readonly progression: ProgressionRepository;
  /** Battements des serveurs et intentions. */
  readonly link: LinkRepository;
  /** Ferme les connexions. L'instance ne doit plus servir ensuite. */
  destroy(): Promise<void>;
}

export interface GameDbOptions {
  /** Secret du lien. À défaut : la variable `ENDERIUM_LINK_SECRET`, lue à chaque dépôt. */
  linkSecret?: string | undefined;
  /** Durée de garde de la liste des tables, en millisecondes. Défaut : 30 secondes. */
  tableCacheTtlMs?: number | undefined;
  /** Connexions simultanées au plus (PostgreSQL, MariaDB). Défaut : 5. */
  poolSize?: number | undefined;
  /** Attente d'un verrou SQLite, en millisecondes. Défaut : 5 secondes. */
  sqliteBusyTimeoutMs?: number | undefined;
  /** Horloge, en millisecondes. Défaut : `Date.now`. Sert aux essais. */
  now?: (() => number) | undefined;
}

const DEFAULT_TABLE_CACHE_TTL_MS = 30_000;
const DEFAULT_POOL_SIZE = 5;
const DEFAULT_SQLITE_BUSY_TIMEOUT_MS = 5_000;
export const DB_URL_ENV = 'ENDERIUM_DB_URL';

/**
 * Ouvre une base : `sqlite:<chemin>`, `postgres://…` ou `mysql://…` (MariaDB). Rien n'est connecté
 * avant la première requête ; une URL de forme inconnue lève {@link GameDbConfigError} tout de suite.
 */
export function createGameDb(url: string, options: GameDbOptions = {}): GameDb {
  const now = options.now ?? Date.now;
  const connection = openConnection(url, {
    poolSize: options.poolSize ?? DEFAULT_POOL_SIZE,
    sqliteBusyTimeoutMs: options.sqliteBusyTimeoutMs ?? DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
  });

  const ctx: DbContext = {
    engine: connection.engine,
    db: connection.db,
    catalog: createTableCatalog(
      connection.db,
      connection.engine,
      options.tableCacheTtlMs ?? DEFAULT_TABLE_CACHE_TTL_MS,
      now,
    ),
    now,
    withWriter: connection.withWriter,
    linkSecret: () => options.linkSecret ?? process.env[LINK_SECRET_ENV],
  };

  return {
    engine: connection.engine,
    meta: createMetaRepository(ctx),
    players: createPlayersRepository(ctx),
    economy: createEconomyRepository(ctx),
    permissions: createPermissionsRepository(ctx),
    regions: createRegionsRepository(ctx),
    moderation: createModerationRepository(ctx),
    progression: createProgressionRepository(ctx),
    link: createLinkRepository(ctx),
    destroy: () => connection.destroy(),
  };
}

interface GlobalSlot {
  url: string;
  db: GameDb;
}

/** Clé sur `globalThis` : l'instance survit aux rechargements à chaud de Next en développement. */
const GLOBAL_KEY = Symbol.for('enderium.game-db');
const globalSlots = globalThis as typeof globalThis & { [GLOBAL_KEY]?: GlobalSlot };

/**
 * L'instance partagée du processus, ouverte à la première demande depuis `ENDERIUM_DB_URL`.
 * Lève {@link GameDbConfigError} si la variable manque.
 */
export function getGameDb(): GameDb {
  const url = process.env[DB_URL_ENV]?.trim();
  if (url === undefined || url === '') {
    throw new GameDbConfigError(
      `Variable ${DB_URL_ENV} absente : la base d'Enderium n'est pas configurée.`,
    );
  }
  const current = globalSlots[GLOBAL_KEY];
  if (current !== undefined && current.url === url) return current.db;

  // L'URL a changé (fichier .env modifié en développement) : on ferme l'ancienne base.
  if (current !== undefined) void current.db.destroy().catch(() => {});
  const db = createGameDb(url);
  globalSlots[GLOBAL_KEY] = { url, db };
  return db;
}

/** Ferme et oublie l'instance partagée (arrêt propre, essais). */
export async function resetGameDb(): Promise<void> {
  const current = globalSlots[GLOBAL_KEY];
  delete globalSlots[GLOBAL_KEY];
  if (current !== undefined) await current.db.destroy();
}
