import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONSOLE_PERMISSIONS,
  DEV_PROFILES,
  isConsolePermission,
  resolveConsolePermissions,
} from '../../src/server/auth/permissions';

interface Manifest {
  app: string;
  permissions: { key: string; name: string; group: string }[];
  roles: { key: string; name: string; parent?: string; permissions: string[] }[];
}

const manifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../ascencia.manifest.json', import.meta.url)),
    'utf8',
  ),
) as Manifest;

describe('jeton → permissions de la console', () => {
  it('garde les permissions exactes et ignore ce que le site ne connaît pas', () => {
    expect(
      resolveConsolePermissions({
        allow: ['console.access', 'players.read', 'server.shutdown', 'images.upload'],
      }),
    ).toEqual(['console.access', 'players.read']);
  });

  it('développe le joker global en toutes les permissions connues', () => {
    expect(resolveConsolePermissions({ allow: ['*'] })).toEqual([...CONSOLE_PERMISSIONS]);
  });

  it('développe un joker de ressource, sans déborder sur les autres', () => {
    expect(resolveConsolePermissions({ allow: ['console.access', 'economy.*'] })).toEqual([
      'console.access',
      'economy.read',
      'economy.write',
    ]);
  });

  it('ne déduit pas l’écriture de la lecture, ni l’inverse', () => {
    expect(resolveConsolePermissions({ allow: ['console.access', 'economy.read'] })).not.toContain(
      'economy.write',
    );
    expect(resolveConsolePermissions({ allow: ['console.access', 'economy.write'] })).not.toContain(
      'economy.read',
    );
  });

  it('fait gagner un refus explicite, même face au joker global', () => {
    const held = resolveConsolePermissions({
      allow: ['*'],
      deny: ['economy.write', 'permissions.*'],
    });
    expect(held).not.toContain('economy.write');
    expect(held).not.toContain('permissions.read');
    expect(held).not.toContain('permissions.write');
    expect(held).toContain('economy.read');
  });

  it('retire les droits de la console à qui n’a pas console.access', () => {
    expect(resolveConsolePermissions({ allow: ['economy.write', 'players.read'] })).toEqual([]);
    expect(resolveConsolePermissions({ allow: ['*'], deny: ['console.access'] })).toEqual([
      'studio.access',
    ]);
  });

  it('laisse studio.access indépendant de la console', () => {
    expect(resolveConsolePermissions({ allow: ['studio.access'] })).toEqual(['studio.access']);
  });

  it('ne donne rien à qui n’a rien, ni à une liste mal formée', () => {
    expect(resolveConsolePermissions({ allow: [] })).toEqual([]);
    expect(
      resolveConsolePermissions({ allow: [42, null, { key: '*' }] as unknown as string[] }),
    ).toEqual([]);
  });

  it('ne prend pas un préfixe pour un joker', () => {
    // `economy` seul, ou `economy.` : ni l'un ni l'autre ne valent `economy.*`.
    expect(
      resolveConsolePermissions({ allow: ['console.access', 'economy', 'economy.', 'eco*'] }),
    ).toEqual(['console.access']);
  });

  it('reconnaît les clés du vocabulaire, et elles seules', () => {
    expect(isConsolePermission('economy.write')).toBe(true);
    expect(isConsolePermission('economy.*')).toBe(false);
    expect(isConsolePermission('*')).toBe(false);
    expect(isConsolePermission(undefined)).toBe(false);
  });
});

describe('profils du mode développement', () => {
  it('donne tous les droits au profil complet', () => {
    expect([...DEV_PROFILES.full.permissions]).toEqual([...CONSOLE_PERMISSIONS]);
  });

  it('ne donne aucune écriture au profil lecture seule', () => {
    const readOnly: readonly string[] = DEV_PROFILES['read-only'].permissions;
    expect(readOnly).toContain('console.access');
    expect(readOnly).toContain('economy.read');
    expect(readOnly.some((permission) => permission.endsWith('.write'))).toBe(false);
    expect(readOnly).not.toContain('studio.access');
  });
});

describe('manifeste Ascencia ID', () => {
  /** Permissions d'un rôle, héritage compris, traduites par le site. */
  function permissionsOf(roleKey: string): string[] {
    const allow: string[] = [];
    let cursor = manifest.roles.find((role) => role.key === roleKey);
    while (cursor) {
      allow.push(...cursor.permissions);
      const parent = cursor.parent;
      cursor = parent ? manifest.roles.find((role) => role.key === parent) : undefined;
    }
    return resolveConsolePermissions({ allow });
  }

  it('déclare exactement le vocabulaire du site', () => {
    expect(manifest.permissions.map((permission) => permission.key)).toEqual([
      ...CONSOLE_PERMISSIONS,
    ]);
  });

  it('n’attribue aux rôles que des permissions déclarées', () => {
    for (const role of manifest.roles) {
      for (const permission of role.permissions) {
        expect(
          permission === '*' || isConsolePermission(permission),
          `${role.key} → ${permission}`,
        ).toBe(true);
      }
    }
  });

  it('donne aux rôles proposés les droits annoncés dans la documentation', () => {
    expect(permissionsOf('support')).toEqual([
      'console.access',
      'players.read',
      'economy.read',
      'journal.read',
    ]);
    expect(permissionsOf('moderator')).toEqual([
      'console.access',
      'players.read',
      'economy.read',
      'regions.read',
      'moderation.read',
      'journal.read',
    ]);
    expect(permissionsOf('admin')).toEqual([...CONSOLE_PERMISSIONS]);
    expect(permissionsOf('owner')).toEqual([...CONSOLE_PERMISSIONS]);
  });

  it('ne laisse aucun rôle sous admin écrire quoi que ce soit', () => {
    for (const key of ['support', 'moderator']) {
      expect(permissionsOf(key).some((permission) => permission.endsWith('.write'))).toBe(false);
    }
  });

  it('ne redéfinit pas le rôle par défaut `user`, qui doit rester sans permission', () => {
    // Ascencia ID attribue `user` à toute personne qui se connecte pour la
    // première fois : lui donner un droit ouvrirait la console à tout le monde.
    expect(manifest.roles.find((role) => role.key === 'user')).toBeUndefined();
    expect(manifest.roles.some((role) => 'is_default' in role)).toBe(false);
  });
});
