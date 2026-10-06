import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InvalidInputError } from '../src';
import { createFixture, type Fixture } from './fixtures/db';
import { ALICE, BOB, DAY, NOW } from './fixtures/seed';

describe('regions', () => {
  let fixture: Fixture;
  beforeAll(() => {
    fixture = createFixture();
  });
  afterAll(() => fixture.cleanup());

  it('lists zones by world then priority, with their counts', async () => {
    const zones = await fixture.db.regions.zones();
    expect(zones.map((zone) => `${zone.world}/${zone.id}`)).toEqual([
      'dungeons/dungeons',
      'enderium/spawn_market',
      'enderium/spawn',
    ]);
    expect(zones[2]).toEqual({
      world: 'enderium',
      id: 'spawn',
      shape: 'cuboid',
      priority: 10,
      parentId: null,
      ownerUuid: null,
      ownerName: null,
      createdAt: NOW - 12 * DAY,
      pointCount: 2,
      flagCount: 2,
      memberCount: 2,
    });
    expect(zones[1]).toMatchObject({
      parentId: 'spawn',
      ownerUuid: ALICE,
      ownerName: 'Alice_Wonder',
      pointCount: 3,
    });
    expect(zones[0]).toMatchObject({
      shape: 'global',
      pointCount: 0,
      flagCount: 1,
      memberCount: 0,
    });
  });

  it('describes a full zone: points, bounds, flags, members, children', async () => {
    const spawn = await fixture.db.regions.zone('enderium', 'spawn');
    expect(spawn).toMatchObject({
      id: 'spawn',
      shape: 'cuboid',
      pointCount: 2,
      flagCount: 2,
      memberCount: 2,
    });
    expect(spawn?.points).toEqual([
      { ordinal: 0, x: -100, z: -50, yMin: -64, yMax: 319 },
      { ordinal: 1, x: 100, z: 80, yMin: -64, yMax: 319 },
    ]);
    expect(spawn?.bounds).toEqual({
      minX: -100,
      maxX: 100,
      minZ: -50,
      maxZ: 80,
      minY: -64,
      maxY: 319,
    });
    expect(spawn?.flags).toEqual([
      { flag: 'build', value: 'deny', setBy: null, setByName: null, setAt: NOW - 12 * DAY },
      {
        flag: 'pvp',
        value: 'deny',
        setBy: ALICE,
        setByName: 'Alice_Wonder',
        setAt: NOW - 11 * DAY,
      },
    ]);
    expect(spawn?.members).toEqual([
      { type: 'group', id: 'modo', name: null, role: 'manager', addedAt: NOW - 12 * DAY },
      { type: 'player', id: BOB, name: 'Bob', role: 'member', addedAt: NOW - 10 * DAY },
    ]);
    expect(spawn?.children).toEqual(['spawn_market']);
  });

  it('handles a polygon and a zone without points', async () => {
    const market = await fixture.db.regions.zone('enderium', 'spawn_market');
    expect(market?.points).toHaveLength(3);
    expect(market?.bounds).toEqual({ minX: 0, maxX: 20, minZ: 0, maxZ: 15, minY: 60, maxY: 90 });
    expect(market?.parentId).toBe('spawn');

    const dungeons = await fixture.db.regions.zone('dungeons', 'dungeons');
    expect(dungeons?.bounds).toBeNull();
    // L'UUID nul désigne le serveur.
    expect(dungeons?.flags[0]).toMatchObject({ flag: 'pvp', setBy: null });
  });

  it('keys a zone by world and id together', async () => {
    expect(await fixture.db.regions.zone('dungeons', 'spawn')).toBeNull();
    expect(await fixture.db.regions.zone('enderium', 'nowhere')).toBeNull();
    await expect(fixture.db.regions.zone('', 'spawn')).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('pages and filters the log', async () => {
    const log = await fixture.db.regions.log();
    expect(log.total).toBe(3);
    expect(log.rows[0]).toEqual({
      id: 3,
      at: NOW - 3 * DAY,
      actorUuid: null,
      actorName: null,
      world: 'dungeons',
      zoneId: 'dungeons',
      action: 'flag',
      detail: 'pvp=deny',
    });
    expect(log.rows[1]).toMatchObject({
      actorUuid: ALICE,
      actorName: 'Alice_Wonder',
      zoneId: 'spawn',
    });

    expect((await fixture.db.regions.log({ world: 'enderium', zoneId: 'spawn' })).total).toBe(2);
    expect(
      (await fixture.db.regions.log({ action: 'create' })).rows.map((entry) => entry.id),
    ).toEqual([1]);
    expect((await fixture.db.regions.log({ actorUuid: ALICE, pageSize: 1 })).pageCount).toBe(2);
  });
});

describe('regions module missing', () => {
  it('answers with empty results', async () => {
    const fixture = createFixture({ withoutTables: ['regions_'] });
    try {
      expect(await fixture.db.regions.zones()).toEqual([]);
      expect(await fixture.db.regions.zone('enderium', 'spawn')).toBeNull();
      expect(await fixture.db.regions.log()).toMatchObject({ rows: [], total: 0 });
    } finally {
      await fixture.cleanup();
    }
  });
});
