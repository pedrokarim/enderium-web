/** État de la base : tables et modules présents, versions du schéma. */
import { sql } from 'kysely';

import type { DbContext } from '../internal/context';
import { toInt } from '../internal/numbers';
import type { TableName } from '../schema';
import { MODULES, MODULE_IDS, type ModuleId } from './modules';

/** Une migration appliquée (`enderium_schema`). */
export interface SchemaMigration {
  module: string;
  version: number;
  description: string;
  appliedAt: number;
}

/** L'état d'un module connu du site. */
export interface ModuleStatus {
  id: ModuleId;
  /** Vrai si toutes ses tables existent. */
  available: boolean;
  /** Nom du module dans `enderium_schema`. */
  schemaModule: string;
  /** Dernière migration appliquée, `null` si aucune n'est enregistrée. */
  schemaVersion: number | null;
  tables: { name: string; present: boolean }[];
}

export interface MetaRepository {
  /** Vrai si la base répond. Ne lève jamais. */
  ping(): Promise<boolean>;
  /** Les noms de toutes les tables de la base, triés. */
  tables(): Promise<string[]>;
  hasTable(table: TableName): Promise<boolean>;
  /** Vrai si toutes les tables du module existent. */
  hasModule(module: ModuleId): Promise<boolean>;
  /** L'état de chaque module connu. */
  modules(): Promise<ModuleStatus[]>;
  /** Toutes les migrations appliquées, par module puis version. Vide si la table manque. */
  schemaVersions(): Promise<SchemaMigration[]>;
  /** Dernière version appliquée d'un module de `enderium_schema`, `null` si inconnue. */
  schemaVersion(schemaModule: string): Promise<number | null>;
  /** Relit la liste des tables à la prochaine question (après l'installation d'un plugin). */
  refresh(): void;
}

export function createMetaRepository(ctx: DbContext): MetaRepository {
  async function schemaVersions(): Promise<SchemaMigration[]> {
    if (!(await ctx.catalog.has('enderium_schema'))) return [];
    const rows = await ctx.db
      .selectFrom('enderium_schema')
      .select(['module', 'version', 'description', 'applied_at'])
      .orderBy('module')
      .orderBy('version')
      .execute();
    return rows.map((row) => ({
      module: row.module,
      version: toInt(row.version, 'version'),
      description: row.description,
      appliedAt: toInt(row.applied_at, 'applied_at'),
    }));
  }

  async function latestVersions(): Promise<Map<string, number>> {
    const latest = new Map<string, number>();
    for (const migration of await schemaVersions()) {
      latest.set(migration.module, Math.max(latest.get(migration.module) ?? 0, migration.version));
    }
    return latest;
  }

  return {
    async ping() {
      try {
        await sql`select 1`.execute(ctx.db);
        return true;
      } catch {
        return false;
      }
    },
    async tables() {
      return [...(await ctx.catalog.list())].sort();
    },
    hasTable: (table) => ctx.catalog.has(table),
    hasModule: (module) => ctx.catalog.has(...MODULES[module].tables),
    async modules() {
      const [names, latest] = await Promise.all([ctx.catalog.list(), latestVersions()]);
      return MODULE_IDS.map((id) => {
        const definition = MODULES[id];
        const tables = definition.tables.map((name) => ({ name, present: names.has(name) }));
        return {
          id,
          available: tables.every((table) => table.present),
          schemaModule: definition.schemaModule,
          schemaVersion: latest.get(definition.schemaModule) ?? null,
          tables,
        };
      });
    },
    schemaVersions,
    async schemaVersion(schemaModule) {
      return (await latestVersions()).get(schemaModule) ?? null;
    },
    refresh: () => ctx.catalog.invalidate(),
  };
}
