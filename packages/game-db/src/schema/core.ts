/**
 * Tables du cœur (`core_*`, `shop_*`, `market_favorites`, `forge_geology`), écrites par le plugin
 * Enderium. Types tirés du DDL réel ; le sens des colonnes est dans
 * `enderium-core/docs/data/core.md`.
 */
import type { Generated } from 'kysely';

export interface CorePlayersTable {
  player_uuid: string;
  name: string;
  ip: string;
  game_mode: string;
  first_seen_at: number;
  last_connection_at: number;
  last_disconnection_at: number;
  world: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface CoreHomesTable {
  player_uuid: string;
  slot: number;
  name: string;
  world: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  created_at: number;
}

export interface CoreSettingsTable {
  player_uuid: string;
  setting: string;
  /** Booléen : 0 ou 1. */
  enabled: number;
}

export interface CoreBlockedTable {
  player_uuid: string;
  blocked_uuid: string;
  blocked_name: string;
  blocked_at: number;
}

export interface CoreFriendsTable {
  player_uuid: string;
  friend_uuid: string;
  friend_name: string;
  since_at: number;
}

export interface CoreReportsTable {
  id: Generated<number>;
  created_at: number;
  reporter_uuid: string;
  reporter_name: string;
  target_uuid: string;
  target_name: string;
  reason: string;
  world: string;
  x: number;
  y: number;
  z: number;
}

export interface CoreBadgesTable {
  player_uuid: string;
  badge_id: string;
  earned_at: number;
}

export interface CoreBadgeCountersTable {
  player_uuid: string;
  stat: string;
  value: number;
}

export interface CoreBadgeShowcaseTable {
  player_uuid: string;
  slot: number;
  badge_id: string;
}

export interface CoreBadgeStateTable {
  player_uuid: string;
  /** Jour au format AAAA-MM-JJ. */
  last_join_day: string;
}

export interface CoreFishingCatchesTable {
  player_uuid: string;
  loot_id: string;
  amount: number;
  max_size: number;
}

export interface CoreFishingStateTable {
  player_uuid: string;
  total: number;
  earned: number;
  earned_day: number;
}

export interface CoreFishingBagTable {
  player_uuid: string;
  slot: number;
  /** Objet sérialisé en Base64. */
  item: string;
}

export interface CoreNameplatesTable {
  player_uuid: string;
  nameplate: string;
  bubble: string;
  /** Booléen : 0 ou 1. */
  preview_tags: number;
}

export interface CorePlayerFlagsTable {
  player_uuid: string;
  flag: string;
  value: string;
}

export interface CoreOnboardingTable {
  player_uuid: string;
  screen: string;
  seen_at: number;
}

export interface CoreItemStashTable {
  player_uuid: string;
  kind: string;
  slot: number;
  item: Uint8Array;
  item_id: string;
  amount: number;
}

export interface CoreCosmeticsOwnedTable {
  player_uuid: string;
  cosmetic_id: string;
}

export interface CoreCosmeticsEquippedTable {
  player_uuid: string;
  slot: string;
  cosmetic_id: string;
}

export interface CoreCosmeticsHiddenTable {
  player_uuid: string;
  reason: string;
}

export interface CoreCosmeticsColorsTable {
  player_uuid: string;
  cosmetic_id: string;
  /** Couleur en 0xRRGGBB. */
  color: number;
}

export interface ShopStockTable {
  product: string;
  period: number;
  units: number;
}

export interface ShopLimitsTable {
  player_uuid: string;
  product: string;
  period: number;
  units: number;
}

export interface ShopPricesTable {
  product: string;
  hour: number;
  price: number;
}

export interface ShopVolumesTable {
  product: string;
  volume: number;
  updated_at: number;
}

export interface ShopSoldTodayTable {
  player_uuid: string;
  product: string;
  day: number;
  units: number;
}

export interface ShopHistoryTable {
  id: Generated<number>;
  player_uuid: string;
  at: number;
  product: string;
  quantity: number;
  total: number;
  /** Booléen : 1 pour une vente du joueur, 0 pour un achat. */
  sale: number;
}

export interface ShopTokenBoughtTable {
  player_uuid: string;
  cosmetic_id: string;
  week: number;
}

export interface MarketFavoritesTable {
  player_uuid: string;
  item_key: string;
}

export interface ForgeGeologyTable {
  player_uuid: string;
  ore: string;
  first_at: number;
  /** 0 pauvre, 1 ordinaire, 2 riche, 3 pure. */
  best_purity: number;
  mined: number;
}

export interface CoreTables {
  core_players: CorePlayersTable;
  core_homes: CoreHomesTable;
  core_settings: CoreSettingsTable;
  core_blocked: CoreBlockedTable;
  core_friends: CoreFriendsTable;
  core_reports: CoreReportsTable;
  core_badges: CoreBadgesTable;
  core_badge_counters: CoreBadgeCountersTable;
  core_badge_showcase: CoreBadgeShowcaseTable;
  core_badge_state: CoreBadgeStateTable;
  core_fishing_catches: CoreFishingCatchesTable;
  core_fishing_state: CoreFishingStateTable;
  core_fishing_bag: CoreFishingBagTable;
  core_nameplates: CoreNameplatesTable;
  core_player_flags: CorePlayerFlagsTable;
  core_onboarding: CoreOnboardingTable;
  core_item_stash: CoreItemStashTable;
  core_cosmetics_owned: CoreCosmeticsOwnedTable;
  core_cosmetics_equipped: CoreCosmeticsEquippedTable;
  core_cosmetics_hidden: CoreCosmeticsHiddenTable;
  core_cosmetics_colors: CoreCosmeticsColorsTable;
  shop_stock: ShopStockTable;
  shop_limits: ShopLimitsTable;
  shop_prices: ShopPricesTable;
  shop_volumes: ShopVolumesTable;
  shop_sold_today: ShopSoldTodayTable;
  shop_history: ShopHistoryTable;
  shop_token_bought: ShopTokenBoughtTable;
  market_favorites: MarketFavoritesTable;
  forge_geology: ForgeGeologyTable;
}
