/**
 * Le schéma complet de la base d'Enderium, vu par Kysely. Écrit à la main à partir du DDL réel
 * (`tests/fixtures/schema.sql`), un fichier par module, noms de colonnes tels qu'en base.
 *
 * Convention de types : les `BIGINT` (dates en millisecondes, montants) et les `SMALLINT` booléens
 * sont des `number` ; la conversion sûre des grands entiers se fait au niveau du pilote
 * (`src/dialects/`), celle des booléens dans les dépôts.
 */
import type { CoreTables } from './core';
import type { DungeonsTables } from './dungeons';
import type { EconomyTables } from './economy';
import type { EntitiesTables } from './entities';
import type { LinkTables } from './link';
import type { OrdersTables } from './orders';
import type { PermissionsTables } from './permissions';
import type { ProfessionsTables } from './professions';
import type { QuestsTables } from './quests';
import type { RegionsTables } from './regions';
import type { ShardsTables } from './shards';

export interface Database
  extends
    CoreTables,
    EconomyTables,
    PermissionsTables,
    RegionsTables,
    ProfessionsTables,
    QuestsTables,
    EntitiesTables,
    DungeonsTables,
    OrdersTables,
    ShardsTables,
    LinkTables {}

export type TableName = keyof Database & string;

export type * from './core';
export type * from './dungeons';
export type * from './economy';
export type * from './entities';
export type * from './link';
export type * from './orders';
export type * from './permissions';
export type * from './professions';
export type * from './quests';
export type * from './regions';
export type * from './shards';
