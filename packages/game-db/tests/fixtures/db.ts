/**
 * Base d'essai : un fichier SQLite temporaire, créé depuis le DDL versionné (`schema.sql`) puis
 * semé de données réalistes. Un fichier plutôt qu'une base en mémoire : les essais passent ainsi
 * par le vrai chemin, connexion de lecture en lecture seule et connexion d'écriture séparée.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createGameDb, type GameDb, type GameDbOptions } from '../../src';
import { NOW, seed } from './seed';

const SCHEMA_PATH = join(import.meta.dirname, 'schema.sql');

export interface FixtureOptions {
  /** Faux : la base n'a pas les tables `link_*` (plugin EnderiumLink absent). Défaut : vrai. */
  withLink?: boolean;
  /** Préfixes de tables à ne pas créer (`perms_`, `economy_`…), pour simuler un module absent. */
  withoutTables?: string[];
  /** Faux : schéma seul, sans données. Défaut : vrai. */
  seeded?: boolean;
  /** Réglages passés à `createGameDb`. L'horloge est figée sur `NOW` par défaut. */
  options?: GameDbOptions;
}

export interface Fixture {
  db: GameDb;
  /** Chemin du fichier SQLite. */
  path: string;
  /** Exécute du SQL brut sur le fichier (préparer un cas, vérifier une écriture). */
  raw<T>(work: (database: DatabaseSync) => T): T;
  cleanup(): Promise<void>;
}

/** Les instructions `CREATE` du schéma versionné, une par entrée. */
export function schemaStatements(): string[] {
  return readFileSync(SCHEMA_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('CREATE '));
}

export function createFixture(fixture: FixtureOptions = {}): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'enderium-game-db-'));
  const path = join(directory, 'enderium.db');
  const excluded = [
    ...(fixture.withoutTables ?? []),
    ...(fixture.withLink === false ? ['link_'] : []),
  ];

  const raw = <T>(work: (database: DatabaseSync) => T): T => {
    const database = new DatabaseSync(path);
    try {
      return work(database);
    } finally {
      database.close();
    }
  };

  raw((database) => {
    // Comme le serveur de jeu : journal en WAL, pour que lecteur et écrivain cohabitent.
    database.exec('PRAGMA journal_mode = WAL');
    for (const statement of schemaStatements()) {
      // La table visée : celle qu'on crée, ou celle que l'index couvre.
      const name =
        /^CREATE TABLE (\w+)/.exec(statement)?.[1] ??
        /^CREATE INDEX \w+ ON (\w+)/.exec(statement)?.[1];
      if (name === undefined) throw new Error(`Instruction de schéma illisible : ${statement}`);
      if (excluded.some((prefix) => name.startsWith(prefix))) continue;
      database.exec(statement);
    }
    if (fixture.seeded !== false) seed(database);
  });

  const db = createGameDb(`sqlite:${path}`, { now: () => NOW, ...fixture.options });

  return {
    db,
    path,
    raw,
    async cleanup() {
      await db.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
