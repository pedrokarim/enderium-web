import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InvalidInputError, UnsafeIntegerError } from '../src';
import { createFixture, type Fixture } from './fixtures/db';
import { ALICE, ALICIA, BOB, CAROL, DAVE, DAY, ERIN, HOUR, MINUTE, NOW } from './fixtures/seed';

const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);

describe('economy', () => {
  let fixture: Fixture;
  beforeAll(() => {
    fixture = createFixture();
  });
  afterAll(() => fixture.cleanup());

  it('summarises the money supply', async () => {
    expect(await fixture.db.economy.overview()).toEqual({
      accounts: 5,
      moneySupply: 501_575,
      averageBalance: 100_315,
      medianBalance: 300,
      highestBalance: 500_000,
      ledgerEntries: 7,
      lastMovementAt: NOW - 30 * MINUTE,
    });
  });

  it('averages the two middle balances when the number of accounts is even', async () => {
    const even = createFixture();
    try {
      even.raw((database) =>
        database
          .prepare('INSERT INTO economy_accounts VALUES (?, ?, ?, ?)')
          .run(ALICIA, 'alicia', 500, NOW),
      );
      // Soldes triés : 0, 75, 300, 500, 1 200, 500 000 → (300 + 500) / 2.
      expect((await even.db.economy.overview())?.medianBalance).toBe(400);
    } finally {
      await even.cleanup();
    }
  });

  it('reads an account with its rank and the current name of its owner', async () => {
    expect(await fixture.db.economy.account(BOB)).toEqual({
      uuid: BOB,
      name: 'Bob',
      balance: 1_200,
      updatedAt: NOW - 2 * HOUR,
      rank: 2,
    });
    // Le compte garde un vieux pseudo : celui de core_players fait foi.
    expect(await fixture.db.economy.account(DAVE)).toMatchObject({
      name: 'DaveTheMiner',
      balance: 0,
      rank: 5,
    });
    expect(await fixture.db.economy.account(ALICIA)).toBeNull();
  });

  it('ranks the richest accounts', async () => {
    expect(await fixture.db.economy.topBalances(3)).toEqual([
      { rank: 1, uuid: ALICE, name: 'Alice_Wonder', balance: 500_000 },
      { rank: 2, uuid: BOB, name: 'Bob', balance: 1_200 },
      { rank: 3, uuid: CAROL, name: 'carol_99', balance: 300 },
    ]);
    await expect(fixture.db.economy.topBalances(0)).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('lists the ledger, most recent first, with the direction of each movement', async () => {
    const page = await fixture.db.economy.ledger();
    expect(page.total).toBe(7);
    expect(page.rows.map((entry) => entry.kind)).toEqual([
      'bounty',
      'bounty',
      'market_fee',
      'shop_buy',
      'pay',
      'quest',
      'admin',
    ]);
    expect(page.rows[0]).toEqual({
      id: 7,
      at: NOW - 30 * MINUTE,
      kind: 'bounty',
      movement: 'creation',
      sourceUuid: null,
      sourceName: null,
      targetUuid: ERIN,
      targetName: 'Erin',
      amount: 75,
      reason: 'gullet',
    });
    expect(page.rows[3]).toMatchObject({
      movement: 'destruction',
      sourceName: 'Bob',
      targetUuid: null,
      reason: null,
    });
    expect(page.rows[4]).toMatchObject({
      movement: 'transfer',
      sourceName: 'Alice_Wonder',
      targetName: 'Bob',
      amount: 200,
      reason: 'cadeau',
    });
  });

  it('filters the ledger by kind, player, movement and period', async () => {
    const { ledger } = fixture.db.economy;
    expect((await ledger({ kind: 'bounty' })).total).toBe(2);
    expect((await ledger({ playerUuid: BOB })).rows.map((entry) => entry.kind)).toEqual([
      'shop_buy',
      'pay',
      'quest',
    ]);
    expect((await ledger({ movement: 'destruction' })).rows.map((entry) => entry.kind)).toEqual([
      'market_fee',
      'shop_buy',
    ]);
    // « from » inclus, « to » exclu.
    const window = await ledger({ from: NOW - DAY, to: NOW - HOUR });
    expect(window.rows.map((entry) => entry.kind)).toEqual(['market_fee', 'shop_buy']);
    expect(
      (await ledger({ kind: 'bounty', pageSize: 1, page: 2 })).rows.map((entry) => entry.amount),
    ).toEqual([300]);
    await expect(ledger({ playerUuid: "x' OR 1=1" })).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('lists the kinds present in the ledger', async () => {
    expect(await fixture.db.economy.kinds()).toEqual([
      'admin',
      'bounty',
      'market_fee',
      'pay',
      'quest',
      'shop_buy',
    ]);
  });

  it('aggregates created, destroyed and transferred money by kind', async () => {
    expect(await fixture.db.economy.flowsByKind()).toEqual([
      { kind: 'admin', created: 500_000, destroyed: 0, transferred: 0, entries: 1 },
      { kind: 'bounty', created: 375, destroyed: 0, transferred: 0, entries: 2 },
      { kind: 'market_fee', created: 0, destroyed: 5, transferred: 0, entries: 1 },
      { kind: 'pay', created: 0, destroyed: 0, transferred: 200, entries: 1 },
      { kind: 'quest', created: 1_500, destroyed: 0, transferred: 0, entries: 1 },
      { kind: 'shop_buy', created: 0, destroyed: 500, transferred: 0, entries: 1 },
    ]);
    const recent = await fixture.db.economy.flowsByKind({ from: NOW - DAY });
    expect(recent.map((flow) => flow.kind)).toEqual(['bounty', 'market_fee', 'shop_buy']);
  });

  it('builds a daily series, with empty days kept', async () => {
    const series = await fixture.db.economy.dailySeries({
      from: NOW - 3 * DAY,
      to: NOW + 1,
      timeZone: 'UTC',
    });
    expect(series).toEqual([
      {
        day: utcDay(NOW - 3 * DAY),
        created: 500_000,
        destroyed: 0,
        transferred: 0,
        net: 500_000,
        entries: 1,
      },
      {
        day: utcDay(NOW - 2 * DAY),
        created: 1_500,
        destroyed: 0,
        transferred: 200,
        net: 1_500,
        entries: 2,
      },
      { day: utcDay(NOW - DAY), created: 0, destroyed: 505, transferred: 0, net: -505, entries: 2 },
      { day: utcDay(NOW), created: 375, destroyed: 0, transferred: 0, net: 375, entries: 2 },
    ]);

    const month = await fixture.db.economy.dailySeries();
    expect(month).toHaveLength(31);
    expect(month.filter((day) => day.entries === 0)).toHaveLength(27);
    expect(month.reduce((sum, day) => sum + day.created, 0)).toBe(501_875);
  });

  it('cuts days in the requested time zone', async () => {
    // NOW tombe à 15 h 20 UTC : à Auckland (UTC+13), c'est déjà le lendemain.
    const series = await fixture.db.economy.dailySeries({
      from: NOW - HOUR,
      to: NOW,
      timeZone: 'Pacific/Auckland',
    });
    expect(series).toEqual([
      { day: utcDay(NOW + DAY), created: 375, destroyed: 0, transferred: 0, net: 375, entries: 2 },
    ]);
  });

  it('rejects an unknown time zone or an oversized period', async () => {
    const { dailySeries } = fixture.db.economy;
    await expect(dailySeries({ timeZone: 'Mars/Olympus' })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    await expect(dailySeries({ from: NOW - 400 * DAY, to: NOW })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    expect(await dailySeries({ from: NOW, to: NOW - DAY })).toEqual([]);
  });
});

describe('economy guards', () => {
  it('fails loudly on a BIGINT that does not fit a JavaScript number', async () => {
    const fixture = createFixture();
    try {
      fixture.raw((database) =>
        database
          .prepare('INSERT INTO economy_accounts VALUES (?, ?, ?, ?)')
          .run(ALICIA, 'alicia', 9_007_199_254_740_993n, NOW),
      );
      await expect(fixture.db.economy.topBalances(1)).rejects.toBeInstanceOf(UnsafeIntegerError);
      await expect(fixture.db.economy.overview()).rejects.toBeInstanceOf(UnsafeIntegerError);
    } finally {
      await fixture.cleanup();
    }
  });

  it('answers with empty results when the economy module is missing', async () => {
    const fixture = createFixture({ withoutTables: ['economy_'] });
    try {
      const { economy } = fixture.db;
      expect(await economy.overview()).toBeNull();
      expect(await economy.account(ALICE)).toBeNull();
      expect(await economy.topBalances()).toEqual([]);
      expect(await economy.ledger({ kind: 'pay' })).toMatchObject({ rows: [], total: 0 });
      expect(await economy.kinds()).toEqual([]);
      expect(await economy.flowsByKind()).toEqual([]);
      const series = await economy.dailySeries({ from: NOW - DAY, to: NOW, timeZone: 'UTC' });
      expect(series.every((day) => day.entries === 0)).toBe(true);
      expect(await fixture.db.meta.hasModule('economy')).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
