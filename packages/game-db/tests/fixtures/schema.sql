-- Schéma de la base d'Enderium, tel que les plugins le créent sous SQLite.
-- Extrait du serveur de test (select sql from sqlite_master), sans aucune donnée.
-- Les deux tables link_* viennent de docs/contracts/intents.md : le plugin EnderiumLink
-- n'est pas encore installé sur le serveur de test.
-- Sert aux essais (tests/fixtures/db.ts) et de référence aux types de src/schema/.

CREATE TABLE core_badge_counters (player_uuid VARCHAR(36) NOT NULL, stat VARCHAR(64) NOT NULL, value BIGINT NOT NULL, PRIMARY KEY (player_uuid, stat));

CREATE TABLE core_badge_showcase (player_uuid VARCHAR(36) NOT NULL, slot INT NOT NULL, badge_id VARCHAR(64) NOT NULL, PRIMARY KEY (player_uuid, slot));

CREATE TABLE core_badge_state (player_uuid VARCHAR(36) NOT NULL PRIMARY KEY, last_join_day VARCHAR(10) NOT NULL);

CREATE TABLE core_badges (player_uuid VARCHAR(36) NOT NULL, badge_id VARCHAR(64) NOT NULL, earned_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, badge_id));
CREATE INDEX core_badges_badge ON core_badges (badge_id);

CREATE TABLE core_blocked (player_uuid VARCHAR(36) NOT NULL, blocked_uuid VARCHAR(36) NOT NULL, blocked_name VARCHAR(16) NOT NULL, blocked_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, blocked_uuid));

CREATE TABLE core_cosmetics_colors (player_uuid VARCHAR(36) NOT NULL, cosmetic_id VARCHAR(64) NOT NULL, color INT NOT NULL, PRIMARY KEY (player_uuid, cosmetic_id));

CREATE TABLE core_cosmetics_equipped (player_uuid VARCHAR(36) NOT NULL, slot VARCHAR(16) NOT NULL, cosmetic_id VARCHAR(64) NOT NULL, PRIMARY KEY (player_uuid, slot));

CREATE TABLE core_cosmetics_hidden (player_uuid VARCHAR(36) NOT NULL, reason VARCHAR(32) NOT NULL, PRIMARY KEY (player_uuid, reason));

CREATE TABLE core_cosmetics_owned (player_uuid VARCHAR(36) NOT NULL, cosmetic_id VARCHAR(64) NOT NULL, PRIMARY KEY (player_uuid, cosmetic_id));
CREATE INDEX core_cosmetics_owned_id ON core_cosmetics_owned (cosmetic_id);

CREATE TABLE core_fishing_bag (player_uuid VARCHAR(36) NOT NULL, slot INT NOT NULL, item TEXT NOT NULL, PRIMARY KEY (player_uuid, slot));

CREATE TABLE core_fishing_catches (player_uuid VARCHAR(36) NOT NULL, loot_id VARCHAR(64) NOT NULL, amount INT NOT NULL DEFAULT 0, max_size DOUBLE NOT NULL DEFAULT 0, PRIMARY KEY (player_uuid, loot_id));
CREATE INDEX core_fishing_catches_loot ON core_fishing_catches (loot_id);

CREATE TABLE core_fishing_state (player_uuid VARCHAR(36) NOT NULL PRIMARY KEY, total INT NOT NULL DEFAULT 0, earned DOUBLE NOT NULL DEFAULT 0, earned_day BIGINT NOT NULL DEFAULT 0);

CREATE TABLE core_friends (player_uuid VARCHAR(36) NOT NULL, friend_uuid VARCHAR(36) NOT NULL, friend_name VARCHAR(16) NOT NULL, since_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, friend_uuid));
CREATE INDEX core_friends_friend ON core_friends (friend_uuid);

CREATE TABLE core_homes (player_uuid VARCHAR(36) NOT NULL, slot INT NOT NULL, name VARCHAR(32) NOT NULL, world VARCHAR(64) NOT NULL, x DOUBLE NOT NULL, y DOUBLE NOT NULL, z DOUBLE NOT NULL, yaw DOUBLE NOT NULL DEFAULT 0, pitch DOUBLE NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, slot));

CREATE TABLE core_item_stash (player_uuid VARCHAR(36) NOT NULL, kind VARCHAR(16) NOT NULL, slot INT NOT NULL, item BLOB NOT NULL, item_id VARCHAR(64) NOT NULL, amount INT NOT NULL DEFAULT 1, PRIMARY KEY (player_uuid, kind, slot));

CREATE TABLE core_nameplates (player_uuid VARCHAR(36) NOT NULL PRIMARY KEY, nameplate VARCHAR(64) NOT NULL DEFAULT 'none', bubble VARCHAR(64) NOT NULL DEFAULT 'none', preview_tags SMALLINT NOT NULL DEFAULT 0);

CREATE TABLE core_onboarding (player_uuid VARCHAR(36) NOT NULL, screen VARCHAR(64) NOT NULL, seen_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, screen));

CREATE TABLE core_player_flags (player_uuid VARCHAR(36) NOT NULL, flag VARCHAR(64) NOT NULL, value VARCHAR(255) NOT NULL, PRIMARY KEY (player_uuid, flag));

CREATE TABLE core_players (player_uuid VARCHAR(36) NOT NULL PRIMARY KEY, name VARCHAR(16) NOT NULL, ip VARCHAR(45) NOT NULL DEFAULT '', game_mode VARCHAR(16) NOT NULL DEFAULT 'SURVIVAL', first_seen_at BIGINT NOT NULL, last_connection_at BIGINT NOT NULL, last_disconnection_at BIGINT NOT NULL, world VARCHAR(64) NOT NULL DEFAULT '', x DOUBLE NOT NULL DEFAULT 0, y DOUBLE NOT NULL DEFAULT 0, z DOUBLE NOT NULL DEFAULT 0, yaw DOUBLE NOT NULL DEFAULT 0, pitch DOUBLE NOT NULL DEFAULT 0);
CREATE INDEX core_players_name ON core_players (name);

CREATE TABLE core_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at BIGINT NOT NULL, reporter_uuid VARCHAR(36) NOT NULL, reporter_name VARCHAR(16) NOT NULL, target_uuid VARCHAR(36) NOT NULL, target_name VARCHAR(16) NOT NULL, reason VARCHAR(255) NOT NULL, world VARCHAR(64) NOT NULL, x INT NOT NULL, y INT NOT NULL, z INT NOT NULL);
CREATE INDEX core_reports_target ON core_reports (target_uuid, created_at);

CREATE TABLE core_settings (player_uuid VARCHAR(36) NOT NULL, setting VARCHAR(48) NOT NULL, enabled SMALLINT NOT NULL, PRIMARY KEY (player_uuid, setting));

CREATE TABLE dungeons_loot_claims (player_uuid VARCHAR(36) NOT NULL, dungeon_id VARCHAR(64) NOT NULL, difficulty VARCHAR(16) NOT NULL, claimed_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, dungeon_id, difficulty));

CREATE TABLE dungeons_records (player_uuid VARCHAR(36) NOT NULL, dungeon_id VARCHAR(64) NOT NULL, difficulty VARCHAR(16) NOT NULL, completions INT NOT NULL, best_time_ms BIGINT NOT NULL, first_completed_at BIGINT NOT NULL, last_completed_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, dungeon_id, difficulty));

CREATE TABLE dungeons_runs (run_id VARCHAR(36) NOT NULL, player_uuid VARCHAR(36) NOT NULL, dungeon_id VARCHAR(64) NOT NULL, difficulty VARCHAR(16) NOT NULL, group_size INT NOT NULL, duration_ms BIGINT NOT NULL, deaths INT NOT NULL, finished_at BIGINT NOT NULL, PRIMARY KEY (run_id, player_uuid));
CREATE INDEX dungeons_runs_board ON dungeons_runs (dungeon_id, difficulty, duration_ms);

CREATE TABLE dungeons_tower_progress (player_uuid VARCHAR(36) NOT NULL, tower_id VARCHAR(64) NOT NULL, highest_floor INT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, tower_id));

CREATE TABLE economy_accounts (uuid VARCHAR(36) PRIMARY KEY, name VARCHAR(16) NOT NULL, balance BIGINT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL);
CREATE INDEX economy_accounts_balance ON economy_accounts (balance);

CREATE TABLE economy_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, at BIGINT NOT NULL, kind VARCHAR(24) NOT NULL, source VARCHAR(36), target VARCHAR(36), amount BIGINT NOT NULL, reason VARCHAR(128));

CREATE TABLE enderium_schema (module VARCHAR(32) NOT NULL, version INT NOT NULL, description VARCHAR(128) NOT NULL, applied_at BIGINT NOT NULL, PRIMARY KEY (module, version));

CREATE TABLE entities_boss_claims (player_uuid VARCHAR(36) NOT NULL, boss_id VARCHAR(64) NOT NULL, claim_day VARCHAR(10) NOT NULL, claims INT NOT NULL, PRIMARY KEY (player_uuid, boss_id, claim_day));

CREATE TABLE entities_kills (player_uuid VARCHAR(36) NOT NULL, creature_id VARCHAR(64) NOT NULL, kills BIGINT NOT NULL, PRIMARY KEY (player_uuid, creature_id));

CREATE TABLE entities_loot_pity (player_uuid VARCHAR(36) NOT NULL, loot_key VARCHAR(128) NOT NULL, misses INT NOT NULL, PRIMARY KEY (player_uuid, loot_key));

CREATE TABLE exchange_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, owner VARCHAR(36) NOT NULL, owner_name VARCHAR(16) NOT NULL, kind VARCHAR(10) NOT NULL, side VARCHAR(4) NOT NULL, item_id VARCHAR(64) NOT NULL, template BLOB NOT NULL, max_stack INT NOT NULL DEFAULT 64, price BIGINT NOT NULL, quantity INT NOT NULL, filled INT NOT NULL DEFAULT 0, escrow BIGINT NOT NULL DEFAULT 0, fee BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, status VARCHAR(10) NOT NULL);
CREATE INDEX exchange_orders_book ON exchange_orders (item_id, side, status);
CREATE INDEX exchange_orders_owner ON exchange_orders (owner, status);

CREATE TABLE exchange_trades (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id VARCHAR(64) NOT NULL, buy_order BIGINT NOT NULL, sell_order BIGINT NOT NULL, buyer VARCHAR(36) NOT NULL, seller VARCHAR(36) NOT NULL, quantity INT NOT NULL, price BIGINT NOT NULL, at BIGINT NOT NULL);
CREATE INDEX exchange_trades_buyer ON exchange_trades (buyer, item_id, at);
CREATE INDEX exchange_trades_item ON exchange_trades (item_id, at);

CREATE TABLE forge_geology (player_uuid VARCHAR(36) NOT NULL, ore VARCHAR(48) NOT NULL, first_at BIGINT NOT NULL, best_purity SMALLINT NOT NULL, mined INT NOT NULL, PRIMARY KEY (player_uuid, ore));

CREATE TABLE market_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, owner VARCHAR(36) NOT NULL, item BLOB NOT NULL, origin VARCHAR(12) NOT NULL, listing_id BIGINT, created_at BIGINT NOT NULL, quantity INT NOT NULL DEFAULT 1);
CREATE INDEX market_deliveries_owner ON market_deliveries (owner);

CREATE TABLE market_favorites (player_uuid VARCHAR(36) NOT NULL, item_key VARCHAR(128) NOT NULL, PRIMARY KEY (player_uuid, item_key));

CREATE TABLE market_listings (id INTEGER PRIMARY KEY AUTOINCREMENT, seller VARCHAR(36) NOT NULL, seller_name VARCHAR(16) NOT NULL, item BLOB NOT NULL, item_id VARCHAR(64), category VARCHAR(24) NOT NULL, amount INT NOT NULL DEFAULT 1, price BIGINT NOT NULL, fee BIGINT NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, status VARCHAR(12) NOT NULL, buyer VARCHAR(36), closed_at BIGINT, net BIGINT NOT NULL DEFAULT 0, seller_notified INT NOT NULL DEFAULT 0);
CREATE INDEX market_listings_seller ON market_listings (seller, status);
CREATE INDEX market_listings_status ON market_listings (status, expires_at);

CREATE TABLE orders_server_contributions (week BIGINT NOT NULL, player_uuid VARCHAR(36) NOT NULL, player_name VARCHAR(16) NOT NULL DEFAULT '', amount INT NOT NULL DEFAULT 0, first_at BIGINT NOT NULL DEFAULT 0, reward BIGINT NOT NULL DEFAULT 0, paid_at BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (week, player_uuid));
CREATE INDEX orders_server_contributions_player ON orders_server_contributions (player_uuid, paid_at);

CREATE TABLE orders_server_weeks (week BIGINT NOT NULL PRIMARY KEY, item VARCHAR(64) NOT NULL, goal INT NOT NULL, pot BIGINT NOT NULL, delivered INT NOT NULL DEFAULT 0, settled_at BIGINT NOT NULL DEFAULT 0);

CREATE TABLE perms_group_parents (group_id VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NOT NULL, PRIMARY KEY (group_id, parent_id));

CREATE TABLE perms_groups (group_id VARCHAR(64) PRIMARY KEY, display_name VARCHAR(64) NOT NULL, weight INT NOT NULL, prefix VARCHAR(128) NOT NULL, suffix VARCHAR(128) NOT NULL, color VARCHAR(16) NOT NULL, staff SMALLINT NOT NULL);

CREATE TABLE perms_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at BIGINT NOT NULL, actor_uuid VARCHAR(36) NOT NULL, action VARCHAR(32) NOT NULL, target_type VARCHAR(8) NOT NULL, target_id VARCHAR(64) NOT NULL, detail TEXT NOT NULL, reason VARCHAR(128) NOT NULL);

CREATE TABLE perms_members (player_uuid VARCHAR(36) NOT NULL, group_id VARCHAR(64) NOT NULL, context VARCHAR(128) NOT NULL, expires_at BIGINT NOT NULL, granted_by VARCHAR(36) NOT NULL, granted_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, group_id, context));

CREATE TABLE perms_meta (target_type VARCHAR(8) NOT NULL, target_id VARCHAR(64) NOT NULL, meta_key VARCHAR(64) NOT NULL, meta_value VARCHAR(128) NOT NULL, PRIMARY KEY (target_type, target_id, meta_key));

CREATE TABLE perms_nodes (target_type VARCHAR(8) NOT NULL, target_id VARCHAR(64) NOT NULL, permission VARCHAR(128) NOT NULL, value SMALLINT NOT NULL, context VARCHAR(128) NOT NULL, expires_at BIGINT NOT NULL, PRIMARY KEY (target_type, target_id, permission, context));
CREATE INDEX perms_nodes_target ON perms_nodes (target_type, target_id);

CREATE TABLE professions_mastery (player_uuid VARCHAR(36) NOT NULL, kind VARCHAR(16) NOT NULL, source_id VARCHAR(64) NOT NULL, count BIGINT NOT NULL, first_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, kind, source_id));

CREATE TABLE professions_xp (player_uuid VARCHAR(36) NOT NULL, profession_id VARCHAR(32) NOT NULL, xp BIGINT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, profession_id));

CREATE TABLE quests_active (player_uuid VARCHAR(36) NOT NULL, quest_id VARCHAR(64) NOT NULL, stage INT NOT NULL, status VARCHAR(16) NOT NULL, started_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, quest_id));

CREATE TABLE quests_history (player_uuid VARCHAR(36) NOT NULL, quest_id VARCHAR(64) NOT NULL, completions INT NOT NULL, last_completed_at BIGINT NOT NULL, PRIMARY KEY (player_uuid, quest_id));

CREATE TABLE quests_progress (player_uuid VARCHAR(36) NOT NULL, quest_id VARCHAR(64) NOT NULL, objective_id VARCHAR(64) NOT NULL, progress INT NOT NULL, PRIMARY KEY (player_uuid, quest_id, objective_id));

CREATE TABLE quests_tracked (player_uuid VARCHAR(36) NOT NULL PRIMARY KEY, quest_id VARCHAR(64) NOT NULL);

CREATE TABLE regions_flags (world VARCHAR(64) NOT NULL, zone_id VARCHAR(64) NOT NULL, flag VARCHAR(64) NOT NULL, value VARCHAR(128) NOT NULL, set_by VARCHAR(36) NOT NULL, set_at BIGINT NOT NULL, PRIMARY KEY (world, zone_id, flag));
CREATE INDEX regions_flags_zone ON regions_flags (world, zone_id);

CREATE TABLE regions_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at BIGINT NOT NULL, actor_uuid VARCHAR(36) NOT NULL, world VARCHAR(64) NOT NULL, zone_id VARCHAR(64) NOT NULL, action VARCHAR(32) NOT NULL, detail TEXT NOT NULL);

CREATE TABLE regions_members (world VARCHAR(64) NOT NULL, zone_id VARCHAR(64) NOT NULL, member_type VARCHAR(8) NOT NULL, member_id VARCHAR(64) NOT NULL, role VARCHAR(16) NOT NULL, added_at BIGINT NOT NULL, PRIMARY KEY (world, zone_id, member_type, member_id));
CREATE INDEX regions_members_zone ON regions_members (world, zone_id);

CREATE TABLE regions_shapes (world VARCHAR(64) NOT NULL, zone_id VARCHAR(64) NOT NULL, ordinal INT NOT NULL, x INT NOT NULL, z INT NOT NULL, y_min INT NOT NULL, y_max INT NOT NULL, PRIMARY KEY (world, zone_id, ordinal));
CREATE INDEX regions_shapes_zone ON regions_shapes (world, zone_id);

CREATE TABLE regions_zones (zone_id VARCHAR(64) NOT NULL, world VARCHAR(64) NOT NULL, shape VARCHAR(16) NOT NULL, priority INT NOT NULL, parent_id VARCHAR(64) NOT NULL, owner_uuid VARCHAR(36) NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY (world, zone_id));

CREATE TABLE shards_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_uuid VARCHAR(36) NOT NULL, delta BIGINT NOT NULL, balance_after BIGINT NOT NULL, reason VARCHAR(48) NOT NULL, created_at BIGINT NOT NULL);
CREATE INDEX shards_log_player ON shards_log (player_uuid, created_at);

CREATE TABLE shop_history (id INTEGER PRIMARY KEY AUTOINCREMENT, player_uuid VARCHAR(36) NOT NULL, at BIGINT NOT NULL, product VARCHAR(64) NOT NULL, quantity INT NOT NULL, total BIGINT NOT NULL, sale SMALLINT NOT NULL DEFAULT 0);
CREATE INDEX shop_history_player ON shop_history (player_uuid, at);

CREATE TABLE shop_limits (player_uuid VARCHAR(36) NOT NULL, product VARCHAR(64) NOT NULL, period BIGINT NOT NULL, units BIGINT NOT NULL, PRIMARY KEY (player_uuid, product));

CREATE TABLE shop_prices (product VARCHAR(64) NOT NULL, hour BIGINT NOT NULL, price BIGINT NOT NULL, PRIMARY KEY (product, hour));

CREATE TABLE shop_sold_today (player_uuid VARCHAR(36) NOT NULL, product VARCHAR(64) NOT NULL, day BIGINT NOT NULL, units INT NOT NULL, PRIMARY KEY (player_uuid, product));

CREATE TABLE shop_stock (product VARCHAR(64) NOT NULL PRIMARY KEY, period BIGINT NOT NULL, units BIGINT NOT NULL);

CREATE TABLE shop_token_bought (player_uuid VARCHAR(36) NOT NULL, cosmetic_id VARCHAR(64) NOT NULL, week BIGINT NOT NULL, PRIMARY KEY (player_uuid, cosmetic_id));

CREATE TABLE shop_volumes (product VARCHAR(64) NOT NULL PRIMARY KEY, volume DOUBLE NOT NULL, updated_at BIGINT NOT NULL);

-- Lien site -> serveur (docs/contracts/intents.md, § 2).
CREATE TABLE link_intents (id VARCHAR(36) NOT NULL PRIMARY KEY, idempotency_key VARCHAR(64) NOT NULL, kind VARCHAR(48) NOT NULL, payload TEXT NOT NULL, target_server VARCHAR(32) NOT NULL DEFAULT '', actor_id VARCHAR(64) NOT NULL, actor_name VARCHAR(64) NOT NULL, actor_uuid VARCHAR(36) NOT NULL DEFAULT '', reason VARCHAR(255) NOT NULL DEFAULT '', status VARCHAR(12) NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, claimed_at BIGINT NOT NULL DEFAULT 0, claimed_by VARCHAR(32) NOT NULL DEFAULT '', finished_at BIGINT NOT NULL DEFAULT 0, result_code VARCHAR(48) NOT NULL DEFAULT '', result_detail TEXT NOT NULL DEFAULT '', signature VARCHAR(64) NOT NULL, UNIQUE (idempotency_key));
CREATE INDEX link_intents_actor ON link_intents (actor_id, created_at);
CREATE INDEX link_intents_status ON link_intents (status, created_at);

CREATE TABLE link_servers (server_id VARCHAR(32) NOT NULL PRIMARY KEY, started_at BIGINT NOT NULL, seen_at BIGINT NOT NULL, plugin_version VARCHAR(32) NOT NULL, minecraft_version VARCHAR(32) NOT NULL, online_players INT NOT NULL, max_players INT NOT NULL, tps_centi INT NOT NULL, mspt_centi INT NOT NULL);
