import { DatabaseSync } from 'node:sqlite';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  DB_URL_ENV,
  GameDbConfigError,
  GameDbError,
  MODULES,
  MODULE_IDS,
  UnsafeIntegerError,
  createGameDb,
  engineOf,
  getGameDb,
  resetGameDb,
} from '../src';
import { sqlitePathOf } from '../src/dialects';
import { parseNumericText, parseNumericTextOrKeep, toBool, toInt } from '../src/internal/numbers';
import { createFixture, schemaStatements, type Fixture } from './fixtures/db';
import { DAY, NOW } from './fixtures/seed';

describe('meta', () => {
  let fixture: Fixture;
  beforeAll(() => {
    fixture = createFixture();
  });
  afterAll(() => fixture.cleanup());

  it('exposes the engine and answers a ping', async () => {
    expect(fixture.db.engine).toBe('sqlite');
    expect(await fixture.db.meta.ping()).toBe(true);
  });

  it('reads the schema versions', async () => {
    const versions = await fixture.db.meta.schemaVersions();
    expect(versions).toHaveLength(4);
    expect(versions[0]).toEqual({
      module: 'core',
      version: 1,
      description: 'maisons, réglages',
      appliedAt: NOW - 30 * DAY,
    });
    expect(await fixture.db.meta.schemaVersion('core')).toBe(10);
    expect(await fixture.db.meta.schemaVersion('economy')).toBe(2);
    expect(await fixture.db.meta.schemaVersion('link')).toBeNull();
  });

  it('reports every known module as present on a full schema', async () => {
    const modules = await fixture.db.meta.modules();
    expect(modules.map((module) => module.id)).toEqual(MODULE_IDS);
    expect(modules.every((module) => module.available)).toBe(true);
    expect(modules.find((module) => module.id === 'shop')).toMatchObject({
      schemaModule: 'core',
      schemaVersion: 10,
    });
    expect(modules.find((module) => module.id === 'regions')?.schemaVersion).toBeNull();
    for (const id of MODULE_IDS) expect(await fixture.db.meta.hasModule(id)).toBe(true);
  });

  it('lists every table of the versioned schema, and the registry covers them all', async () => {
    const created = schemaStatements()
      .map((statement) => /^CREATE TABLE (\w+)/.exec(statement)?.[1])
      .filter((name): name is string => name !== undefined)
      .sort();
    expect(await fixture.db.meta.tables()).toEqual(created);

    const registered = [
      ...MODULE_IDS.flatMap((id) => [...MODULES[id].tables]),
      'enderium_schema',
    ].sort();
    expect(registered).toEqual(created);
  });
});

describe('meta with missing modules', () => {
  it('tells which modules and tables are absent', async () => {
    const fixture = createFixture({ withLink: false, withoutTables: ['exchange_trades'] });
    try {
      const { meta } = fixture.db;
      expect(await meta.hasModule('link')).toBe(false);
      expect(await meta.hasModule('exchange')).toBe(false);
      expect(await meta.hasModule('economy')).toBe(true);
      expect(await meta.hasTable('exchange_orders')).toBe(true);
      expect(await meta.hasTable('exchange_trades')).toBe(false);

      const modules = await meta.modules();
      expect(modules.filter((module) => !module.available).map((module) => module.id)).toEqual([
        'exchange',
        'link',
      ]);
      expect(modules.find((module) => module.id === 'exchange')?.tables).toEqual([
        { name: 'exchange_orders', present: true },
        { name: 'exchange_trades', present: false },
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('caches the table list for a while, and can be refreshed', async () => {
    let clock = NOW;
    const fixture = createFixture({
      withLink: false,
      options: { now: () => clock, tableCacheTtlMs: 30_000 },
    });
    try {
      expect(await fixture.db.link.available()).toBe(false);

      // Le plugin EnderiumLink s'installe : ses tables apparaissent.
      fixture.raw((database) => {
        for (const statement of schemaStatements().filter((line) => line.includes('link_')))
          database.exec(statement);
      });
      expect(await fixture.db.link.available()).toBe(false);

      clock += 30_000;
      expect(await fixture.db.link.available()).toBe(true);

      fixture.raw((database) => database.exec('DROP TABLE link_servers'));
      expect(await fixture.db.link.available()).toBe(true);
      fixture.db.meta.refresh();
      expect(await fixture.db.link.available()).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('works on an empty database', async () => {
    const fixture = createFixture({ withoutTables: [''] });
    try {
      expect(await fixture.db.meta.tables()).toEqual([]);
      expect(await fixture.db.meta.schemaVersions()).toEqual([]);
      expect((await fixture.db.meta.modules()).some((module) => module.available)).toBe(false);
      expect(await fixture.db.players.count()).toBe(0);
      expect(await fixture.db.economy.overview()).toBeNull();
      expect(await fixture.db.permissions.groups()).toEqual([]);
      expect(await fixture.db.regions.zones()).toEqual([]);
      expect((await fixture.db.moderation.reports()).total).toBe(0);
      expect(
        Object.values(await fixture.db.progression.of('00000000-0000-4000-8000-000000000001')),
      ).toEqual(Array.from({ length: 9 }, () => null));
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('opening a database', () => {
  afterEach(async () => {
    await resetGameDb();
    delete process.env[DB_URL_ENV];
  });

  it('recognises the engine from the URL', () => {
    expect(engineOf('sqlite:./enderium.db')).toBe('sqlite');
    expect(engineOf('postgres://user:pass@db:5432/enderium')).toBe('postgres');
    expect(engineOf('postgresql://db/enderium')).toBe('postgres');
    expect(engineOf('mysql://user:pass@db:3306/enderium')).toBe('mysql');
    expect(engineOf('mariadb://db/enderium')).toBe('mysql');
    expect(() => engineOf('mongodb://db/enderium')).toThrow(GameDbConfigError);
    expect(() => createGameDb('enderium.db')).toThrow(GameDbConfigError);
    expect(() => createGameDb('sqlite:')).toThrow(GameDbConfigError);
  });

  it('resolves SQLite paths', () => {
    expect(sqlitePathOf('sqlite::memory:')).toBe(':memory:');
    expect(sqlitePathOf('sqlite:relative/enderium.db')).toMatch(/relative[\\/]enderium\.db$/);
    expect(sqlitePathOf('sqlite:///var/lib/enderium.db')).toMatch(/var[\\/]lib[\\/]enderium\.db$/);
  });

  it('builds engines for PostgreSQL and MariaDB without connecting', async () => {
    const postgres = createGameDb('postgres://user:pass@127.0.0.1:1/enderium');
    const mysql = createGameDb('mysql://user:pass@127.0.0.1:1/enderium');
    expect(postgres.engine).toBe('postgres');
    expect(mysql.engine).toBe('mysql');
    await postgres.destroy();
    await mysql.destroy();
  });

  it('fails with a clear error when the SQLite file does not exist, and never creates it', async () => {
    const fixture = createFixture();
    const missing = `${fixture.path}.missing`;
    const db = createGameDb(`sqlite:${missing}`);
    try {
      await expect(db.players.count()).rejects.toBeInstanceOf(GameDbError);
      expect(await db.meta.ping()).toBe(false);
      expect(() => new DatabaseSync(missing, { readOnly: true })).toThrow();
    } finally {
      await db.destroy();
      await fixture.cleanup();
    }
  });

  it('supports an in-memory database for quick experiments', async () => {
    const db = createGameDb('sqlite::memory:');
    try {
      expect(await db.meta.tables()).toEqual([]);
      expect(await db.players.count()).toBe(0);
    } finally {
      await db.destroy();
    }
  });

  it('keeps one shared instance per URL across calls', async () => {
    const fixture = createFixture();
    const other = createFixture({ seeded: false });
    try {
      expect(() => getGameDb()).toThrow(GameDbConfigError);

      process.env[DB_URL_ENV] = `sqlite:${fixture.path}`;
      const first = getGameDb();
      expect(getGameDb()).toBe(first);
      expect(await first.players.count()).toBe(6);

      // L'URL change (fichier .env modifié en développement) : une nouvelle instance la remplace.
      process.env[DB_URL_ENV] = `sqlite:${other.path}`;
      const second = getGameDb();
      expect(second).not.toBe(first);
      expect(await second.players.count()).toBe(0);
    } finally {
      await resetGameDb();
      await fixture.cleanup();
      await other.cleanup();
    }
  });
});

describe('numbers', () => {
  it('reads integers exactly, whatever shape the driver returns', () => {
    expect(toInt(42, 'c')).toBe(42);
    expect(toInt(42n, 'c')).toBe(42);
    expect(toInt('1791300000000', 'c')).toBe(1_791_300_000_000);
    expect(toInt('-7', 'c')).toBe(-7);
    expect(toInt('9007199254740991', 'c')).toBe(Number.MAX_SAFE_INTEGER);
    // SUM d'un BIGINT sous MariaDB : un DECIMAL.
    expect(toInt('501575.000', 'c')).toBe(501_575);
  });

  it('refuses integers beyond the safe range instead of rounding them', () => {
    expect(() => toInt('9007199254740993', 'balance')).toThrow(UnsafeIntegerError);
    expect(() => toInt(9_007_199_254_740_993n, 'balance')).toThrow(UnsafeIntegerError);
    expect(() => toInt(2 ** 53, 'balance')).toThrow(UnsafeIntegerError);
    expect(() => toInt('-9223372036854775808', 'balance')).toThrow(/balance/);
    expect(() => parseNumericText('9223372036854775807')).toThrow(UnsafeIntegerError);
  });

  it('refuses what is not an integer', () => {
    expect(() => toInt(1.5, 'c')).toThrow(TypeError);
    expect(() => toInt('abc', 'c')).toThrow(TypeError);
    expect(() => toInt(null, 'c')).toThrow(TypeError);
    expect(() => toInt('12.5', 'c')).toThrow(TypeError);
  });

  it('reads decimals and keeps unsafe text intact for the MariaDB driver', () => {
    expect(parseNumericText('100315.0000')).toBe(100_315);
    expect(parseNumericText('12.75')).toBe(12.75);
    expect(parseNumericTextOrKeep('123')).toBe(123);
    expect(parseNumericTextOrKeep('9007199254740993')).toBe('9007199254740993');
  });

  it('reads SMALLINT booleans', () => {
    expect(toBool(1, 'staff')).toBe(true);
    expect(toBool(0, 'staff')).toBe(false);
    expect(toBool('1', 'staff')).toBe(true);
    expect(toBool(0n, 'staff')).toBe(false);
  });
});
