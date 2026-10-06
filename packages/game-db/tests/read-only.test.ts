/**
 * Non-régression de la règle mère du dépôt : le site ne modifie jamais une donnée de jeu. Le
 * package lit, et n'écrit qu'en insérant des intentions.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createFixture, type Fixture } from './fixtures/db';
import { ALICE, BOB } from './fixtures/seed';

const SOURCE_ROOT = join(import.meta.dirname, '..', 'src');
/** Le seul fichier qui a le droit d'écrire : le dépôt des intentions. */
const INTENT_REPOSITORY = 'link/repository.ts';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const sources = sourceFiles(SOURCE_ROOT).map((path) => ({
  name: relative(SOURCE_ROOT, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}));

/** Tout ce qui modifierait ou supprimerait une ligne, par Kysely ou en SQL brut. */
const MUTATIONS = [
  /\bupdateTable\b/,
  /\bdeleteFrom\b/,
  /\bmergeInto\b/,
  /\breplaceInto\b/,
  // Mots-clés SQL en majuscules, où qu'ils soient (commentaires compris : on n'en parle même pas).
  /\bUPDATE\s/,
  /\bDELETE\s/,
  /\bTRUNCATE\s/,
  /\bDROP\s/,
  /\bALTER\s/,
  // Les mêmes en SQL brut, quelle que soit la casse.
  /\bupdate\s+[\w.`"]+\s+set\b/i,
  /\bdelete\s+from\b/i,
  /\btruncate\s+table\b/i,
  /\b(?:drop|alter)\s+(?:table|index|column)\b/i,
  /\breplace\s+into\b/i,
  /\bonConflict\b/,
  /\bonDuplicateKeyUpdate\b/,
];
/** Les écritures par ajout : permises dans le seul dépôt des intentions. */
const INSERTIONS = [/\binsertInto\b/, /\bINSERT\s+INTO\b/i];

describe('read-only rule', () => {
  it('scans the whole source tree', () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.map((source) => source.name)).toContain(INTENT_REPOSITORY);
  });

  it('never updates nor deletes, anywhere in the package', () => {
    const offences = sources.flatMap((source) =>
      MUTATIONS.filter((pattern) => pattern.test(source.text)).map(
        (pattern) => `${source.name}: ${pattern}`,
      ),
    );
    expect(offences).toEqual([]);
  });

  it('inserts in one place only: the intent repository, into link_intents', () => {
    const writers = sources.filter((source) =>
      INSERTIONS.some((pattern) => pattern.test(source.text)),
    );
    expect(writers.map((source) => source.name)).toEqual([INTENT_REPOSITORY]);

    const [repository] = writers;
    const targets = [...(repository?.text ?? '').matchAll(/insertInto\(\s*'([^']+)'\s*\)/g)].map(
      (match) => match[1],
    );
    expect(targets).toEqual(['link_intents']);
  });

  it('opens its write connection in one place only', () => {
    const users = sources.filter(
      (source) => /\bwithWriter\(/.test(source.text) && !source.name.startsWith('dialects/'),
    );
    expect(users.map((source) => source.name)).toEqual([INTENT_REPOSITORY]);
  });
});

describe('read-only connection', () => {
  let fixture: Fixture;
  beforeAll(() => {
    fixture = createFixture({ options: { linkSecret: 'un-secret-de-test-assez-long-0123456789' } });
  });
  afterAll(() => fixture.cleanup());

  it('leaves the game tables untouched after reading everything and enqueueing an intent', async () => {
    const snapshot = () =>
      fixture.raw((database) => {
        const tables = database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'link_intents' ORDER BY name",
          )
          .all()
          .map((row) => String(row.name));
        return Object.fromEntries(
          tables.map((table) => [
            table,
            JSON.stringify(database.prepare(`SELECT * FROM ${table}`).all()),
          ]),
        );
      });

    const before = snapshot();
    const { db } = fixture;
    await Promise.all([
      db.meta.modules(),
      db.players.list({ search: 'a', sort: 'balance' }),
      db.players.get(ALICE),
      db.players.onlineEstimate(),
      db.economy.overview(),
      db.economy.ledger({ playerUuid: BOB }),
      db.economy.flowsByKind(),
      db.economy.dailySeries(),
      db.permissions.groups(),
      db.permissions.group('admin'),
      db.permissions.log(),
      db.regions.zones(),
      db.regions.zone('enderium', 'spawn'),
      db.regions.log(),
      db.moderation.reports(),
      db.progression.of(ALICE),
      db.link.servers(),
      db.link.intents.list(),
    ]);
    const { created } = await db.link.intents.enqueue({
      kind: 'economy.withdraw',
      payload: { playerUuid: BOB, amount: 10 },
      idempotencyKey: 'console:read-only',
      actorId: 'asc_usr_alice',
      actorName: 'Alice',
      reason: 'Essai',
    });
    expect(created).toBe(true);
    expect(snapshot()).toEqual(before);
  });
});
