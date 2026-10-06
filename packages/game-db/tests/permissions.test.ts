import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InvalidInputError } from '../src';
import { createFixture, type Fixture } from './fixtures/db';
import { ALICE, ALICIA, BOB, CAROL, DAVE, DAY, NOW } from './fixtures/seed';

describe('permissions', () => {
  let fixture: Fixture;
  beforeAll(() => {
    fixture = createFixture();
  });
  afterAll(() => fixture.cleanup());

  it('lists groups by weight, with parents, ancestors, members and meta', async () => {
    const groups = await fixture.db.permissions.groups();
    expect(groups.map((group) => group.id)).toEqual(['owner', 'admin', 'modo', 'hero', 'player']);

    expect(groups[0]).toEqual({
      id: 'owner',
      displayName: 'permissions.group.owner',
      weight: 1500,
      prefix: '<glyph:owner_tag>',
      suffix: '',
      color: '#fa4943',
      staff: true,
      parents: ['admin'],
      ancestors: ['admin', 'modo', 'hero', 'player'],
      memberCount: 1,
      meta: { 'homes.slots': '15' },
    });

    const byId = new Map(groups.map((group) => [group.id, group]));
    expect(byId.get('modo')?.ancestors).toEqual(['hero', 'player']);
    expect(byId.get('player')).toMatchObject({
      parents: [],
      ancestors: [],
      staff: false,
      memberCount: 1,
    });
    // Carol a expiré : seul Bob compte dans « hero ».
    expect(byId.get('hero')?.memberCount).toBe(1);
    expect(byId.get('admin')).toMatchObject({ memberCount: 0, meta: {} });
  });

  it('survives an inheritance cycle', async () => {
    const cyclic = createFixture();
    try {
      cyclic.raw((database) =>
        database.prepare('INSERT INTO perms_group_parents VALUES (?, ?)').run('player', 'owner'),
      );
      const groups = await cyclic.db.permissions.groups();
      const player = groups.find((group) => group.id === 'player');
      expect(player?.ancestors).toEqual(['owner', 'admin', 'modo', 'hero']);
    } finally {
      await cyclic.cleanup();
    }
  });

  it('describes one group with its own and inherited nodes', async () => {
    const admin = await fixture.db.permissions.group('admin');
    expect(admin).toMatchObject({ id: 'admin', children: ['owner'], parents: ['modo'] });
    expect(admin?.nodes).toEqual([
      {
        permission: 'enderium.zones.admin',
        value: true,
        context: null,
        expiresAt: null,
        expired: false,
      },
    ]);
    // L'ancêtre le plus proche d'abord : modo, puis player.
    expect(admin?.inheritedNodes).toEqual([
      {
        permission: 'enderium.fly',
        value: false,
        context: 'world=enderium',
        expiresAt: NOW - 1,
        expired: true,
        fromGroupId: 'modo',
      },
      {
        permission: 'enderium.home',
        value: true,
        context: null,
        expiresAt: null,
        expired: false,
        fromGroupId: 'player',
      },
    ]);
    expect(admin?.members).toEqual([]);
  });

  it('lists the members of a group, expired ones flagged', async () => {
    const hero = await fixture.db.permissions.group('hero');
    expect(hero?.members).toEqual([
      {
        playerUuid: BOB,
        playerName: 'Bob',
        context: null,
        expiresAt: null,
        active: true,
        grantedBy: ALICE,
        grantedByName: 'Alice_Wonder',
        grantedAt: NOW - 5 * DAY,
      },
      {
        playerUuid: CAROL,
        playerName: 'carol_99',
        context: null,
        expiresAt: NOW - 1_000,
        active: false,
        grantedBy: ALICE,
        grantedByName: 'Alice_Wonder',
        grantedAt: NOW - 9 * DAY,
      },
    ]);

    const page = await fixture.db.permissions.members('hero', { pageSize: 1, page: 2 });
    expect(page.total).toBe(2);
    expect(page.rows.map((member) => member.playerUuid)).toEqual([CAROL]);
  });

  it('returns null for an unknown group', async () => {
    expect(await fixture.db.permissions.group('ghost')).toBeNull();
    await expect(fixture.db.permissions.group('')).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('lists the memberships of a player, heaviest group first', async () => {
    const bob = await fixture.db.permissions.membershipsOf(BOB);
    expect(bob.map((membership) => membership.groupId)).toEqual(['hero', 'player']);
    expect(bob[0]).toMatchObject({
      active: true,
      grantedBy: ALICE,
      grantedByName: 'Alice_Wonder',
      expiresAt: null,
    });
    expect(bob[0]?.group?.weight).toBe(500);
    // Donnée par le serveur : pas d'auteur.
    expect(bob[1]).toMatchObject({ grantedBy: null, grantedByName: null });

    const alice = await fixture.db.permissions.membershipsOf(ALICE);
    expect(alice[0]).toMatchObject({ groupId: 'owner', grantedBy: 'import', grantedByName: null });

    const carol = await fixture.db.permissions.membershipsOf(CAROL);
    expect(carol[0]).toMatchObject({ groupId: 'hero', active: false, expiresAt: NOW - 1_000 });

    const dave = await fixture.db.permissions.membershipsOf(DAVE);
    expect(dave[0]).toMatchObject({ groupId: 'modo', active: true, expiresAt: NOW + 30 * DAY });

    expect(await fixture.db.permissions.membershipsOf(ALICIA)).toEqual([]);
  });

  it('reads the nodes and meta set directly on a player', async () => {
    expect(await fixture.db.permissions.overridesOf(BOB)).toEqual({
      nodes: [
        {
          permission: 'enderium.special',
          value: true,
          context: null,
          expiresAt: null,
          expired: false,
        },
      ],
      meta: { 'chat.cooldown': '0' },
    });
    expect(await fixture.db.permissions.overridesOf(ALICE)).toEqual({ nodes: [], meta: {} });
  });

  it('pages and filters the log, resolving actor and target names', async () => {
    const log = await fixture.db.permissions.log();
    expect(log.total).toBe(3);
    expect(log.rows.map((entry) => entry.action)).toEqual([
      'group.permission',
      'member.add',
      'import',
    ]);
    expect(log.rows[1]).toEqual({
      id: 2,
      at: NOW - 5 * DAY,
      actorUuid: ALICE,
      actorName: 'Alice_Wonder',
      action: 'member.add',
      targetType: 'player',
      targetId: BOB,
      targetName: 'Bob',
      detail: 'hero',
      reason: 'promotion',
    });
    // Le serveur comme acteur ; une cible de type groupe n'a pas de pseudo.
    expect(log.rows[2]).toMatchObject({
      actorUuid: null,
      actorName: null,
      targetName: 'Alice_Wonder',
    });
    expect(log.rows[0]).toMatchObject({
      targetType: 'group',
      targetId: 'admin',
      targetName: null,
      reason: null,
    });

    expect((await fixture.db.permissions.log({ actorUuid: ALICE })).total).toBe(2);
    expect((await fixture.db.permissions.log({ targetType: 'group' })).total).toBe(1);
    expect((await fixture.db.permissions.log({ action: 'import', targetId: ALICE })).total).toBe(1);
    expect(
      (await fixture.db.permissions.log({ from: NOW - 5 * DAY, to: NOW - 4 * DAY })).rows.map(
        (e) => e.id,
      ),
    ).toEqual([2]);
    expect(
      (await fixture.db.permissions.log({ pageSize: 2, page: 2 })).rows.map((entry) => entry.id),
    ).toEqual([1]);
  });
});

describe('permissions module missing', () => {
  it('answers with empty results', async () => {
    const fixture = createFixture({ withoutTables: ['perms_'] });
    try {
      const { permissions } = fixture.db;
      expect(await permissions.groups()).toEqual([]);
      expect(await permissions.group('admin')).toBeNull();
      expect(await permissions.members('admin')).toMatchObject({ rows: [], total: 0 });
      expect(await permissions.membershipsOf(ALICE)).toEqual([]);
      expect(await permissions.overridesOf(ALICE)).toEqual({ nodes: [], meta: {} });
      expect(await permissions.log()).toMatchObject({ rows: [], total: 0 });
      expect((await fixture.db.players.get(ALICE))?.primaryGroup).toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });
});
