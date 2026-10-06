/**
 * Données d'essai : six joueurs, leurs comptes, un journal de l'économie, cinq grades en chaîne
 * d'héritage, trois zones, des signalements, la progression d'une joueuse et un serveur en ligne.
 * Les valeurs attendues par les essais sont calculées à la main à partir de ce fichier.
 */
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

/** L'instant « présent » de tous les essais (2026-10-05 environ). */
export const NOW = 1_791_300_000_000;
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const ALICE = uuid(1);
export const BOB = uuid(2);
export const CAROL = uuid(3);
export const DAVE = uuid(4);
export const ERIN = uuid(5);
export const ALICIA = uuid(6);
/** Un UUID qui n'existe nulle part. */
export const NOBODY = uuid(999);
export const NIL = '00000000-0000-0000-0000-000000000000';

export const SEEDED_INTENT_ID = '11111111-2222-4333-8444-555555555555';

type Row = Record<string, SQLInputValue>;

function insert(database: DatabaseSync, table: string, rows: Row[]): void {
  for (const row of rows) {
    const columns = Object.keys(row);
    database
      .prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      )
      .run(...Object.values(row));
  }
}

/** Vrai si la table existe : un essai peut retirer un module du schéma. */
function has(database: DatabaseSync, table: string): boolean {
  return (
    database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !==
    undefined
  );
}

export function seed(database: DatabaseSync): void {
  const player = (
    id: string,
    name: string,
    firstSeen: number,
    connection: number,
    disconnection: number,
  ): Row => ({
    player_uuid: id,
    name,
    ip: '203.0.113.7',
    game_mode: 'SURVIVAL',
    first_seen_at: firstSeen,
    last_connection_at: connection,
    last_disconnection_at: disconnection,
    world: 'enderium',
    x: 12.5,
    y: 64,
    z: -8.25,
    yaw: 90,
    pitch: 0,
  });

  if (has(database, 'enderium_schema')) {
    insert(database, 'enderium_schema', [
      { module: 'core', version: 1, description: 'maisons, réglages', applied_at: NOW - 30 * DAY },
      { module: 'core', version: 10, description: 'forge', applied_at: NOW - 20 * DAY },
      {
        module: 'economy',
        version: 2,
        description: 'quantité des livraisons',
        applied_at: NOW - 25 * DAY,
      },
      { module: 'permissions', version: 1, description: 'groupes', applied_at: NOW - 15 * DAY },
    ]);
  }

  if (has(database, 'core_players')) {
    insert(database, 'core_players', [
      // Alice est en session : sa connexion est postérieure à sa déconnexion.
      player(ALICE, 'Alice_Wonder', NOW - 30 * DAY, NOW - 10 * MINUTE, NOW - 2 * DAY),
      player(BOB, 'Bob', NOW - 20 * DAY, NOW - 3 * HOUR, NOW - 2 * HOUR),
      player(CAROL, 'carol_99', NOW - 10 * DAY, NOW - 5 * DAY, NOW - 4 * DAY),
      player(DAVE, 'DaveTheMiner', NOW - 9 * DAY, NOW - 8 * DAY, NOW - 7 * DAY),
      player(ERIN, 'Erin', NOW - 2 * DAY, NOW - 2 * DAY, NOW - 1 * DAY),
      {
        ...player(ALICIA, 'alicia', NOW - 1 * DAY, NOW - 1 * DAY, NOW - 23 * HOUR),
        world: '',
        ip: '',
      },
    ]);
  }

  if (has(database, 'economy_accounts')) {
    // Masse : 501 575 ; médiane : 300 ; Alicia n'a pas de compte.
    insert(database, 'economy_accounts', [
      { uuid: ALICE, name: 'Alice_Wonder', balance: 500_000, updated_at: NOW - HOUR },
      { uuid: BOB, name: 'Bob', balance: 1_200, updated_at: NOW - 2 * HOUR },
      { uuid: CAROL, name: 'carol_99', balance: 300, updated_at: NOW - HOUR },
      { uuid: DAVE, name: 'OldDave', balance: 0, updated_at: NOW - 7 * DAY },
      { uuid: ERIN, name: 'Erin', balance: 75, updated_at: NOW - 30 * MINUTE },
    ]);
    insert(database, 'economy_ledger', [
      {
        at: NOW - 3 * DAY,
        kind: 'admin',
        source: null,
        target: ALICE,
        amount: 500_000,
        reason: 'dotation',
      },
      {
        at: NOW - 2 * DAY,
        kind: 'quest',
        source: null,
        target: BOB,
        amount: 1_500,
        reason: 'first_steps',
      },
      {
        at: NOW - 2 * DAY + HOUR,
        kind: 'pay',
        source: ALICE,
        target: BOB,
        amount: 200,
        reason: 'cadeau',
      },
      { at: NOW - 1 * DAY, kind: 'shop_buy', source: BOB, target: null, amount: 500, reason: null },
      {
        at: NOW - 1 * DAY + 2 * HOUR,
        kind: 'market_fee',
        source: ALICE,
        target: null,
        amount: 5,
        reason: 'annonce #1',
      },
      {
        at: NOW - HOUR,
        kind: 'bounty',
        source: null,
        target: CAROL,
        amount: 300,
        reason: 'wraith',
      },
      {
        at: NOW - 30 * MINUTE,
        kind: 'bounty',
        source: null,
        target: ERIN,
        amount: 75,
        reason: 'gullet',
      },
    ]);
  }

  if (has(database, 'perms_groups')) {
    const group = (id: string, weight: number, staff: number, color: string): Row => ({
      group_id: id,
      display_name: `permissions.group.${id}`,
      weight,
      prefix: `<glyph:${id}_tag>`,
      suffix: '',
      color,
      staff,
    });
    insert(database, 'perms_groups', [
      group('player', 0, 0, '#aaaaaa'),
      group('hero', 500, 0, '#33aaff'),
      group('modo', 1100, 1, '#44cc66'),
      group('admin', 1300, 1, '#b30000'),
      group('owner', 1500, 1, '#fa4943'),
    ]);
    // owner → admin → modo → hero → player
    insert(database, 'perms_group_parents', [
      { group_id: 'owner', parent_id: 'admin' },
      { group_id: 'admin', parent_id: 'modo' },
      { group_id: 'modo', parent_id: 'hero' },
      { group_id: 'hero', parent_id: 'player' },
    ]);
    insert(database, 'perms_members', [
      {
        player_uuid: ALICE,
        group_id: 'owner',
        context: '',
        expires_at: 0,
        granted_by: 'import',
        granted_at: NOW - 15 * DAY,
      },
      {
        player_uuid: BOB,
        group_id: 'hero',
        context: '',
        expires_at: 0,
        granted_by: ALICE,
        granted_at: NOW - 5 * DAY,
      },
      {
        player_uuid: BOB,
        group_id: 'player',
        context: '',
        expires_at: 0,
        granted_by: '',
        granted_at: NOW - 20 * DAY,
      },
      // Expirée : ne compte plus dans le groupe, mais reste dans l'historique du joueur.
      {
        player_uuid: CAROL,
        group_id: 'hero',
        context: '',
        expires_at: NOW - 1_000,
        granted_by: ALICE,
        granted_at: NOW - 9 * DAY,
      },
      {
        player_uuid: DAVE,
        group_id: 'modo',
        context: '',
        expires_at: NOW + 30 * DAY,
        granted_by: ALICE,
        granted_at: NOW - 6 * DAY,
      },
    ]);
    insert(database, 'perms_nodes', [
      {
        target_type: 'group',
        target_id: 'owner',
        permission: '*',
        value: 1,
        context: '',
        expires_at: 0,
      },
      {
        target_type: 'group',
        target_id: 'admin',
        permission: 'enderium.zones.admin',
        value: 1,
        context: '',
        expires_at: 0,
      },
      {
        target_type: 'group',
        target_id: 'modo',
        permission: 'enderium.fly',
        value: 0,
        context: 'world=enderium',
        expires_at: NOW - 1,
      },
      {
        target_type: 'group',
        target_id: 'player',
        permission: 'enderium.home',
        value: 1,
        context: '',
        expires_at: 0,
      },
      {
        target_type: 'player',
        target_id: BOB,
        permission: 'enderium.special',
        value: 1,
        context: '',
        expires_at: 0,
      },
    ]);
    insert(database, 'perms_meta', [
      { target_type: 'group', target_id: 'owner', meta_key: 'homes.slots', meta_value: '15' },
      { target_type: 'group', target_id: 'player', meta_key: 'homes.slots', meta_value: '3' },
      { target_type: 'player', target_id: BOB, meta_key: 'chat.cooldown', meta_value: '0' },
    ]);
    insert(database, 'perms_log', [
      {
        at: NOW - 15 * DAY,
        actor_uuid: '',
        action: 'import',
        target_type: 'player',
        target_id: ALICE,
        detail: 'Owner → owner',
        reason: 'reprise unique',
      },
      {
        at: NOW - 5 * DAY,
        actor_uuid: ALICE,
        action: 'member.add',
        target_type: 'player',
        target_id: BOB,
        detail: 'hero',
        reason: 'promotion',
      },
      {
        at: NOW - 4 * DAY,
        actor_uuid: ALICE,
        action: 'group.permission',
        target_type: 'group',
        target_id: 'admin',
        detail: 'enderium.zones.admin=true',
        reason: '',
      },
    ]);
  }

  if (has(database, 'regions_zones')) {
    insert(database, 'regions_zones', [
      {
        zone_id: 'spawn',
        world: 'enderium',
        shape: 'cuboid',
        priority: 10,
        parent_id: '',
        owner_uuid: '',
        created_at: NOW - 12 * DAY,
      },
      {
        zone_id: 'spawn_market',
        world: 'enderium',
        shape: 'polygon',
        priority: 20,
        parent_id: 'spawn',
        owner_uuid: ALICE,
        created_at: NOW - 11 * DAY,
      },
      {
        zone_id: 'dungeons',
        world: 'dungeons',
        shape: 'global',
        priority: 0,
        parent_id: '',
        owner_uuid: '',
        created_at: NOW - 3 * DAY,
      },
    ]);
    insert(database, 'regions_shapes', [
      { world: 'enderium', zone_id: 'spawn', ordinal: 0, x: -100, z: -50, y_min: -64, y_max: 319 },
      { world: 'enderium', zone_id: 'spawn', ordinal: 1, x: 100, z: 80, y_min: -64, y_max: 319 },
      { world: 'enderium', zone_id: 'spawn_market', ordinal: 0, x: 0, z: 0, y_min: 60, y_max: 90 },
      { world: 'enderium', zone_id: 'spawn_market', ordinal: 1, x: 20, z: 0, y_min: 60, y_max: 90 },
      {
        world: 'enderium',
        zone_id: 'spawn_market',
        ordinal: 2,
        x: 10,
        z: 15,
        y_min: 60,
        y_max: 90,
      },
    ]);
    insert(database, 'regions_flags', [
      {
        world: 'enderium',
        zone_id: 'spawn',
        flag: 'build',
        value: 'deny',
        set_by: '',
        set_at: NOW - 12 * DAY,
      },
      {
        world: 'enderium',
        zone_id: 'spawn',
        flag: 'pvp',
        value: 'deny',
        set_by: ALICE,
        set_at: NOW - 11 * DAY,
      },
      {
        world: 'dungeons',
        zone_id: 'dungeons',
        flag: 'pvp',
        value: 'deny',
        set_by: NIL,
        set_at: NOW - 3 * DAY,
      },
    ]);
    insert(database, 'regions_members', [
      {
        world: 'enderium',
        zone_id: 'spawn',
        member_type: 'group',
        member_id: 'modo',
        role: 'manager',
        added_at: NOW - 12 * DAY,
      },
      {
        world: 'enderium',
        zone_id: 'spawn',
        member_type: 'player',
        member_id: BOB,
        role: 'member',
        added_at: NOW - 10 * DAY,
      },
    ]);
    insert(database, 'regions_log', [
      {
        at: NOW - 12 * DAY,
        actor_uuid: ALICE,
        world: 'enderium',
        zone_id: 'spawn',
        action: 'create',
        detail: 'cuboid',
      },
      {
        at: NOW - 11 * DAY,
        actor_uuid: ALICE,
        world: 'enderium',
        zone_id: 'spawn',
        action: 'flag',
        detail: 'pvp=deny',
      },
      {
        at: NOW - 3 * DAY,
        actor_uuid: NIL,
        world: 'dungeons',
        zone_id: 'dungeons',
        action: 'flag',
        detail: 'pvp=deny',
      },
    ]);
  }

  if (has(database, 'core_reports')) {
    const report = (
      at: number,
      reporter: string,
      reporterName: string,
      target: string,
      targetName: string,
    ): Row => ({
      created_at: at,
      reporter_uuid: reporter,
      reporter_name: reporterName,
      target_uuid: target,
      target_name: targetName,
      reason: 'report.reason.insult',
      world: 'enderium',
      x: 10,
      y: 70,
      z: -3,
    });
    insert(database, 'core_reports', [
      report(NOW - 6 * DAY, CAROL, 'carol_99', BOB, 'Bobby'),
      report(NOW - 2 * DAY, CAROL, 'carol_99', BOB, 'Bob'),
      report(NOW - 1 * DAY, DAVE, 'DaveTheMiner', CAROL, 'carol_99'),
    ]);
  }

  // La progression d'Alice.
  if (has(database, 'professions_xp')) {
    insert(database, 'professions_xp', [
      { player_uuid: ALICE, profession_id: 'gardener', xp: 500, updated_at: NOW - DAY },
      { player_uuid: ALICE, profession_id: 'guardian', xp: 1_153, updated_at: NOW - HOUR },
    ]);
    insert(database, 'professions_mastery', [
      {
        player_uuid: ALICE,
        kind: 'crop',
        source_id: 'thyme',
        count: 40,
        first_at: NOW - 9 * DAY,
        updated_at: NOW - DAY,
      },
      {
        player_uuid: ALICE,
        kind: 'crop',
        source_id: 'bell_pepper',
        count: 12,
        first_at: NOW - 8 * DAY,
        updated_at: NOW - DAY,
      },
      {
        player_uuid: ALICE,
        kind: 'fish',
        source_id: 'pufferfish',
        count: 3,
        first_at: NOW - 7 * DAY,
        updated_at: NOW - DAY,
      },
    ]);
  }
  if (has(database, 'core_badges')) {
    insert(database, 'core_badges', [
      { player_uuid: ALICE, badge_id: 'first_harvest', earned_at: NOW - 20 * DAY },
      { player_uuid: ALICE, badge_id: 'cosmetics_1', earned_at: NOW - 10 * DAY },
    ]);
    insert(database, 'core_badge_showcase', [
      { player_uuid: ALICE, slot: 1, badge_id: 'cosmetics_1' },
    ]);
    insert(database, 'core_fishing_catches', [
      { player_uuid: ALICE, loot_id: 'pufferfish', amount: 2, max_size: 24.5 },
      { player_uuid: ALICE, loot_id: 'damselfish', amount: 5, max_size: 12.75 },
    ]);
    insert(database, 'core_fishing_state', [
      { player_uuid: ALICE, total: 7, earned: 0, earned_day: 0 },
    ]);
    insert(database, 'core_cosmetics_owned', [
      { player_uuid: ALICE, cosmetic_id: 'straw_hat' },
      { player_uuid: ALICE, cosmetic_id: 'red_balloon' },
      { player_uuid: ALICE, cosmetic_id: 'bear_backpack' },
    ]);
    insert(database, 'core_cosmetics_equipped', [
      { player_uuid: ALICE, slot: 'HELMET', cosmetic_id: 'straw_hat' },
    ]);
    insert(database, 'core_player_flags', [
      { player_uuid: ALICE, flag: 'shards.balance', value: '42' },
      { player_uuid: ALICE, flag: 'hud.enabled', value: '1' },
    ]);
  }
  if (has(database, 'quests_active')) {
    insert(database, 'quests_active', [
      {
        player_uuid: ALICE,
        quest_id: 'fishing_day',
        stage: 0,
        status: 'READY',
        started_at: NOW - 2 * DAY,
      },
    ]);
    insert(database, 'quests_history', [
      {
        player_uuid: ALICE,
        quest_id: 'first_steps',
        completions: 1,
        last_completed_at: NOW - 20 * DAY,
      },
      {
        player_uuid: ALICE,
        quest_id: 'daily_harvest',
        completions: 3,
        last_completed_at: NOW - DAY,
      },
    ]);
  }
  if (has(database, 'entities_kills')) {
    insert(database, 'entities_kills', [
      { player_uuid: ALICE, creature_id: 'moss_golem', kills: 4 },
      { player_uuid: ALICE, creature_id: 'slug', kills: 21 },
    ]);
  }
  if (has(database, 'dungeons_records')) {
    insert(database, 'dungeons_records', [
      {
        player_uuid: ALICE,
        dungeon_id: 'moss_crypt',
        difficulty: 'normal',
        completions: 2,
        best_time_ms: 421_000,
        first_completed_at: NOW - 5 * DAY,
        last_completed_at: NOW - 2 * DAY,
      },
    ]);
  }
  if (has(database, 'dungeons_tower_progress')) {
    insert(database, 'dungeons_tower_progress', [
      { player_uuid: ALICE, tower_id: 'depths', highest_floor: 5, updated_at: NOW - DAY },
    ]);
  }

  if (has(database, 'link_servers')) {
    insert(database, 'link_servers', [
      {
        server_id: 'survival',
        started_at: NOW - 6 * HOUR,
        seen_at: NOW - 10_000,
        plugin_version: '1.4.0',
        minecraft_version: '26.2',
        online_players: 3,
        max_players: 100,
        tps_centi: 1998,
        mspt_centi: 1234,
      },
      {
        server_id: 'creative',
        started_at: NOW - 2 * DAY,
        seen_at: NOW - 10 * MINUTE,
        plugin_version: '1.3.9',
        minecraft_version: '26.2',
        online_players: 7,
        max_players: 20,
        tps_centi: 2000,
        mspt_centi: 800,
      },
    ]);
    insert(database, 'link_intents', [
      {
        id: SEEDED_INTENT_ID,
        idempotency_key: 'console:seeded',
        kind: 'economy.deposit',
        payload: `{"playerUuid":"${BOB}","amount":100}`,
        target_server: '',
        actor_id: 'asc_usr_alice',
        actor_name: 'Alice',
        actor_uuid: ALICE,
        reason: 'Geste commercial',
        status: 'done',
        created_at: NOW - HOUR,
        expires_at: NOW - HOUR + 10 * MINUTE,
        claimed_at: NOW - HOUR + 3_000,
        claimed_by: 'survival',
        finished_at: NOW - HOUR + 3_050,
        result_code: 'ok',
        result_detail: '{"balanceAfter":1200}',
        signature: 'a'.repeat(64),
      },
    ]);
  }
}
