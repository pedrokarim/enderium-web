/**
 * Les modules de la base et leurs tables. Un module est « présent » quand toutes ses tables
 * existent ; `schemaModule` est son nom dans `enderium_schema` (plusieurs modules du site peuvent
 * dépendre des migrations d'un même plugin).
 */
import type { TableName } from '../schema';

interface ModuleDefinition {
  readonly schemaModule: string;
  readonly tables: ReadonlyArray<TableName>;
}

export const MODULES = {
  core: {
    schemaModule: 'core',
    tables: [
      'core_players',
      'core_homes',
      'core_settings',
      'core_blocked',
      'core_friends',
      'core_reports',
      'core_badges',
      'core_badge_counters',
      'core_badge_showcase',
      'core_badge_state',
      'core_fishing_catches',
      'core_fishing_state',
      'core_fishing_bag',
      'core_nameplates',
      'core_player_flags',
      'core_onboarding',
      'core_item_stash',
      'core_cosmetics_owned',
      'core_cosmetics_equipped',
      'core_cosmetics_hidden',
      'core_cosmetics_colors',
    ],
  },
  shop: {
    schemaModule: 'core',
    tables: [
      'shop_stock',
      'shop_limits',
      'shop_prices',
      'shop_volumes',
      'shop_sold_today',
      'shop_history',
      'shop_token_bought',
    ],
  },
  forge: { schemaModule: 'core', tables: ['forge_geology'] },
  economy: { schemaModule: 'economy', tables: ['economy_accounts', 'economy_ledger'] },
  market: {
    schemaModule: 'economy',
    tables: ['market_listings', 'market_deliveries', 'market_favorites'],
  },
  exchange: { schemaModule: 'economy', tables: ['exchange_orders', 'exchange_trades'] },
  permissions: {
    schemaModule: 'permissions',
    tables: [
      'perms_groups',
      'perms_group_parents',
      'perms_members',
      'perms_nodes',
      'perms_meta',
      'perms_log',
    ],
  },
  regions: {
    schemaModule: 'regions',
    tables: ['regions_zones', 'regions_shapes', 'regions_flags', 'regions_members', 'regions_log'],
  },
  professions: { schemaModule: 'professions', tables: ['professions_xp', 'professions_mastery'] },
  quests: {
    schemaModule: 'quests',
    tables: ['quests_active', 'quests_progress', 'quests_history', 'quests_tracked'],
  },
  entities: {
    schemaModule: 'entities',
    tables: ['entities_kills', 'entities_boss_claims', 'entities_loot_pity'],
  },
  dungeons: {
    schemaModule: 'dungeons',
    tables: [
      'dungeons_runs',
      'dungeons_records',
      'dungeons_loot_claims',
      'dungeons_tower_progress',
    ],
  },
  orders: {
    schemaModule: 'orders',
    tables: ['orders_server_weeks', 'orders_server_contributions'],
  },
  shards: { schemaModule: 'shards', tables: ['shards_log'] },
  link: { schemaModule: 'link', tables: ['link_intents', 'link_servers'] },
} as const satisfies Record<string, ModuleDefinition>;

export type ModuleId = keyof typeof MODULES;

export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];

export function isModuleId(value: string): value is ModuleId {
  return Object.hasOwn(MODULES, value);
}
