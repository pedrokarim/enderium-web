import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createFixture, type Fixture } from './fixtures/db';
import { ALICE, BOB, CAROL, DAVE, DAY, HOUR, NOBODY, NOW } from './fixtures/seed';

describe('moderation', () => {
  let fixture: Fixture;
  beforeAll(() => {
    fixture = createFixture();
  });
  afterAll(() => fixture.cleanup());

  it('lists reports, most recent first, with current names', async () => {
    const page = await fixture.db.moderation.reports();
    expect(page.total).toBe(3);
    expect(page.rows[0]).toEqual({
      id: 3,
      createdAt: NOW - DAY,
      reporterUuid: DAVE,
      reporterName: 'DaveTheMiner',
      targetUuid: CAROL,
      targetName: 'carol_99',
      reason: 'report.reason.insult',
      location: { world: 'enderium', x: 10, y: 70, z: -3 },
    });
    // Le signalement garde « Bobby » ; le pseudo actuel est « Bob ».
    expect(page.rows[2]?.targetName).toBe('Bob');
  });

  it('filters reports by target, reporter and period', async () => {
    const { reports } = fixture.db.moderation;
    expect((await reports({ targetUuid: BOB })).total).toBe(2);
    expect((await reports({ reporterUuid: DAVE })).rows.map((report) => report.id)).toEqual([3]);
    expect((await reports({ from: NOW - 3 * DAY })).rows.map((report) => report.id)).toEqual([
      3, 2,
    ]);
    expect(
      (await reports({ targetUuid: BOB, pageSize: 1, page: 2 })).rows.map((report) => report.id),
    ).toEqual([1]);
  });

  it('counts the reports received and filed by a player', async () => {
    expect(await fixture.db.moderation.reportCountsOf(BOB)).toEqual({ received: 2, filed: 0 });
    expect(await fixture.db.moderation.reportCountsOf(CAROL)).toEqual({ received: 1, filed: 2 });
    expect(await fixture.db.moderation.reportCountsOf(NOBODY)).toEqual({ received: 0, filed: 0 });
  });
});

describe('progression', () => {
  let fixture: Fixture;
  beforeAll(() => {
    fixture = createFixture();
  });
  afterAll(() => fixture.cleanup());

  it('gathers the whole progression of a player', async () => {
    expect(await fixture.db.progression.of(ALICE)).toEqual({
      professions: [
        { professionId: 'guardian', xp: 1_153, updatedAt: NOW - HOUR },
        { professionId: 'gardener', xp: 500, updatedAt: NOW - DAY },
      ],
      mastery: [
        { kind: 'crop', sources: 2, actions: 52 },
        { kind: 'fish', sources: 1, actions: 3 },
      ],
      badges: {
        count: 2,
        earned: [
          { badgeId: 'cosmetics_1', earnedAt: NOW - 10 * DAY },
          { badgeId: 'first_harvest', earnedAt: NOW - 20 * DAY },
        ],
        showcase: [{ slot: 1, badgeId: 'cosmetics_1' }],
      },
      quests: {
        active: [{ questId: 'fishing_day', stage: 0, status: 'READY', startedAt: NOW - 2 * DAY }],
        completedQuests: 2,
        totalCompletions: 4,
        history: [
          { questId: 'daily_harvest', completions: 3, lastCompletedAt: NOW - DAY },
          { questId: 'first_steps', completions: 1, lastCompletedAt: NOW - 20 * DAY },
        ],
      },
      dungeons: {
        totalCompletions: 2,
        records: [
          {
            dungeonId: 'moss_crypt',
            difficulty: 'normal',
            completions: 2,
            bestTimeMs: 421_000,
            firstCompletedAt: NOW - 5 * DAY,
            lastCompletedAt: NOW - 2 * DAY,
          },
        ],
        towers: [{ towerId: 'depths', highestFloor: 5, updatedAt: NOW - DAY }],
      },
      fishing: {
        totalCatches: 7,
        species: 2,
        catches: [
          { lootId: 'damselfish', amount: 5, maxSize: 12.75 },
          { lootId: 'pufferfish', amount: 2, maxSize: 24.5 },
        ],
      },
      kills: {
        total: 25,
        creatures: [
          { creatureId: 'slug', kills: 21 },
          { creatureId: 'moss_golem', kills: 4 },
        ],
      },
      cosmetics: { owned: 3, equipped: [{ slot: 'HELMET', cosmeticId: 'straw_hat' }] },
      shards: 42,
    });
  });

  it('returns empty sections for a player without progress', async () => {
    const progression = await fixture.db.progression.of(BOB);
    expect(progression.professions).toEqual([]);
    expect(progression.badges).toEqual({ count: 0, earned: [], showcase: [] });
    expect(progression.quests).toMatchObject({
      active: [],
      completedQuests: 0,
      totalCompletions: 0,
    });
    expect(progression.fishing).toEqual({ totalCatches: 0, species: 0, catches: [] });
    expect(progression.kills).toEqual({ total: 0, creatures: [] });
    expect(progression.cosmetics).toEqual({ owned: 0, equipped: [] });
    expect(progression.shards).toBe(0);
  });

  it('marks the sections of missing modules as null, and keeps the others', async () => {
    const partial = createFixture({
      withoutTables: ['professions_', 'quests_', 'dungeons_tower_progress', 'entities_'],
    });
    try {
      const progression = await partial.db.progression.of(ALICE);
      expect(progression.professions).toBeNull();
      expect(progression.mastery).toBeNull();
      expect(progression.quests).toBeNull();
      expect(progression.kills).toBeNull();
      // Le module des donjons est là, mais pas encore sa migration 2 (les tours).
      expect(progression.dungeons).toMatchObject({ totalCompletions: 2, towers: [] });
      expect(progression.badges?.count).toBe(2);
      expect(await partial.db.meta.hasModule('dungeons')).toBe(false);
      expect(await partial.db.meta.hasTable('dungeons_records')).toBe(true);
    } finally {
      await partial.cleanup();
    }
  });
});
