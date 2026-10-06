import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InvalidInputError, MAX_PAGE_SIZE } from '../src';
import { createFixture, type Fixture } from './fixtures/db';
import { ALICE, ALICIA, BOB, CAROL, DAVE, ERIN, HOUR, MINUTE, NOBODY, NOW } from './fixtures/seed';

describe('players', () => {
  let fixture: Fixture;
  beforeAll(() => {
    fixture = createFixture();
  });
  afterAll(() => fixture.cleanup());

  it('lists every player, sorted by name without regard to case', async () => {
    const page = await fixture.db.players.list();
    expect(page.total).toBe(6);
    expect(page.page).toBe(1);
    expect(page.pageCount).toBe(1);
    expect(page.rows.map((player) => player.name)).toEqual([
      'Alice_Wonder',
      'alicia',
      'Bob',
      'carol_99',
      'DaveTheMiner',
      'Erin',
    ]);
  });

  it('paginates with a stable order and reports the total', async () => {
    const first = await fixture.db.players.list({ page: 1, pageSize: 4 });
    const second = await fixture.db.players.list({ page: 2, pageSize: 4 });
    const beyond = await fixture.db.players.list({ page: 9, pageSize: 4 });
    expect(first.rows).toHaveLength(4);
    expect(second.rows.map((player) => player.name)).toEqual(['DaveTheMiner', 'Erin']);
    expect(first.pageCount).toBe(2);
    expect(second.total).toBe(6);
    expect(beyond.rows).toEqual([]);
    expect(beyond.total).toBe(6);
  });

  it('clamps the page size and rejects a malformed page', async () => {
    const page = await fixture.db.players.list({ pageSize: 5_000 });
    expect(page.pageSize).toBe(MAX_PAGE_SIZE);
    await expect(fixture.db.players.list({ page: 0 })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(fixture.db.players.list({ pageSize: 2.5 })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });

  it('searches a name by substring or prefix, case-insensitively', async () => {
    const contains = await fixture.db.players.list({ search: 'ALI' });
    expect(contains.rows.map((player) => player.name)).toEqual(['Alice_Wonder', 'alicia']);
    expect(contains.total).toBe(2);

    const inner = await fixture.db.players.list({ search: 'miner' });
    expect(inner.rows.map((player) => player.uuid)).toEqual([DAVE]);

    const prefix = await fixture.db.players.list({ search: 'miner', searchMode: 'prefix' });
    expect(prefix.total).toBe(0);
    const prefixHit = await fixture.db.players.list({ search: 'dave', searchMode: 'prefix' });
    expect(prefixHit.rows.map((player) => player.uuid)).toEqual([DAVE]);
  });

  it('treats LIKE wildcards in the search as plain characters', async () => {
    const underscore = await fixture.db.players.list({ search: '_' });
    expect(underscore.rows.map((player) => player.name)).toEqual(['Alice_Wonder', 'carol_99']);
    expect((await fixture.db.players.list({ search: '%' })).total).toBe(0);
    expect((await fixture.db.players.list({ search: '!' })).total).toBe(0);
  });

  it('never lets a search string reach the SQL text', async () => {
    const page = await fixture.db.players.list({ search: "'; DROP TABLE core_players; --" });
    expect(page.total).toBe(0);
    expect(await fixture.db.players.count()).toBe(6);
  });

  it('finds a player by exact UUID, whatever the case', async () => {
    const page = await fixture.db.players.list({ search: BOB.toUpperCase() });
    expect(page.rows.map((player) => player.name)).toEqual(['Bob']);
  });

  it('sorts by last seen, first seen and balance', async () => {
    const lastSeen = await fixture.db.players.list({ sort: 'lastSeen' });
    expect(lastSeen.rows.map((player) => player.uuid)).toEqual([
      ALICE,
      BOB,
      ALICIA,
      ERIN,
      CAROL,
      DAVE,
    ]);

    const firstSeen = await fixture.db.players.list({ sort: 'firstSeen', direction: 'asc' });
    expect(firstSeen.rows[0]?.uuid).toBe(ALICE);
    expect(firstSeen.rows.at(-1)?.uuid).toBe(ALICIA);

    const richest = await fixture.db.players.list({ sort: 'balance', pageSize: 3 });
    expect(richest.rows.map((player) => player.uuid)).toEqual([ALICE, BOB, CAROL]);
    expect(richest.rows.map((player) => player.balance)).toEqual([500_000, 1_200, 300]);
  });

  it('attaches the balance and the heaviest active group', async () => {
    const { rows } = await fixture.db.players.list();
    const byUuid = new Map(rows.map((player) => [player.uuid, player]));

    expect(byUuid.get(ALICE)?.primaryGroup).toEqual({
      id: 'owner',
      displayName: 'permissions.group.owner',
      color: '#fa4943',
      weight: 1500,
      staff: true,
    });
    // Bob est dans « hero » et « player » : le plus fort poids l'emporte.
    expect(byUuid.get(BOB)?.primaryGroup?.id).toBe('hero');
    // L'appartenance de Carol est expirée.
    expect(byUuid.get(CAROL)?.primaryGroup).toBeNull();
    expect(byUuid.get(ALICIA)?.balance).toBeNull();
    expect(byUuid.get(DAVE)?.balance).toBe(0);
  });

  it('returns a full player sheet, or null for an unknown player', async () => {
    const alice = await fixture.db.players.get(ALICE);
    expect(alice).toMatchObject({
      uuid: ALICE,
      name: 'Alice_Wonder',
      gameMode: 'SURVIVAL',
      lastConnectionAt: NOW - 10 * MINUTE,
      lastSeenAt: NOW - 10 * MINUTE,
      online: true,
      balance: 500_000,
      lastIp: '203.0.113.7',
      lastLocation: { world: 'enderium', x: 12.5, y: 64, z: -8.25, yaw: 90, pitch: 0 },
    });

    const alicia = await fixture.db.players.get(ALICIA);
    expect(alicia?.lastIp).toBeNull();
    expect(alicia?.lastLocation).toBeNull();
    expect(alicia?.online).toBe(false);

    expect(await fixture.db.players.get(NOBODY)).toBeNull();
    await expect(fixture.db.players.get('not-a-uuid')).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('finds a player by exact name', async () => {
    expect((await fixture.db.players.findByName('ALICIA'))?.uuid).toBe(ALICIA);
    expect(await fixture.db.players.findByName('ali')).toBeNull();
  });

  it('lists the most recently seen players', async () => {
    const recent = await fixture.db.players.recentlySeen(2);
    expect(recent.map((player) => player.uuid)).toEqual([ALICE, BOB]);
    expect(recent[1]?.lastSeenAt).toBe(NOW - 2 * HOUR);
  });

  it('estimates who is online from the server heartbeat', async () => {
    const estimate = await fixture.db.players.onlineEstimate();
    // Seul « survival » bat encore : ses 3 joueurs comptent, pas les 7 du serveur éteint.
    expect(estimate.source).toBe('heartbeat');
    expect(estimate.count).toBe(3);
    expect(estimate.players.map((player) => player.uuid)).toEqual([ALICE]);
  });
});

describe('players without the link module', () => {
  it('falls back to open sessions to estimate who is online', async () => {
    const fixture = createFixture({ withLink: false });
    try {
      const estimate = await fixture.db.players.onlineEstimate();
      expect(estimate).toMatchObject({ source: 'sessions', count: 1 });
      expect(estimate.players[0]?.uuid).toBe(ALICE);
    } finally {
      await fixture.cleanup();
    }
  });

  it('answers with empty results when the core tables are missing', async () => {
    const fixture = createFixture({ withoutTables: ['core_players'] });
    try {
      expect(await fixture.db.players.list({ search: 'ali' })).toMatchObject({
        rows: [],
        total: 0,
        pageCount: 1,
      });
      expect(await fixture.db.players.get(ALICE)).toBeNull();
      expect(await fixture.db.players.count()).toBe(0);
      expect(await fixture.db.players.recentlySeen()).toEqual([]);
      expect((await fixture.db.players.onlineEstimate()).players).toEqual([]);
      // Le journal reste lisible, sans pseudo à côté des UUID.
      expect((await fixture.db.economy.ledger()).rows[0]?.targetName).toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });

  it('sorts by name when the economy module is missing', async () => {
    const fixture = createFixture({ withoutTables: ['economy_'] });
    try {
      const page = await fixture.db.players.list({ sort: 'balance', pageSize: 2 });
      expect(page.rows.map((player) => player.balance)).toEqual([null, null]);
      expect(page.total).toBe(6);
      expect((await fixture.db.players.get(ERIN))?.balance).toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });
});
