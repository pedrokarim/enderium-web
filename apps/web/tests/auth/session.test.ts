import { describe, expect, it } from 'vitest';
import {
  COOKIE_VALUE_MAX_LENGTH,
  RIGHTS_MAX_AGE,
  RIGHTS_REFRESH_AFTER,
  SESSION_ABSOLUTE_TTL,
  SESSION_IDLE_TTL,
  TRANSACTION_TTL,
  type SessionPayload,
  type SignInTransaction,
  openSession,
  openTransaction,
  sealSession,
  sealTransaction,
  sessionStanding,
  toConsoleUser,
} from '../../src/server/auth/session';

const SECRET = 'k3Jx9Qm2Vt7Lp0Zr5Ny8Hb4Wd1Fs6Gc3Ua9Ei2Ox7Tq';
const OTHER_SECRET = 'Zr5Ny8Hb4Wd1Fs6Gc3Ua9Ei2Ox7Tqk3Jx9Qm2Vt7Lp0';
const NOW = 1_800_000_000;

function session(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    sub: '0192f3a1-0000-7000-8000-000000000001',
    name: 'Karim',
    avatar: 'https://cdn.test.example/avatars/karim.png',
    minecraftUuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
    roles: ['admin'],
    permissions: ['console.access', 'economy.read', 'economy.write'],
    startedAt: NOW,
    expiresAt: NOW + SESSION_IDLE_TTL,
    absoluteExpiresAt: NOW + SESSION_ABSOLUTE_TTL,
    checkedAt: NOW,
    sid: 'sso-session-1',
    refreshToken: 'asc_rt_secret_refresh_token_value',
    ...overrides,
  };
}

/** Change un caractère au milieu d'un segment du JWE compact. */
function tamper(token: string, segmentIndex: number): string {
  const segments = token.split('.');
  const segment = segments[segmentIndex] ?? '';
  const middle = Math.floor(segment.length / 2);
  const replacement = segment[middle] === 'A' ? 'B' : 'A';
  segments[segmentIndex] = segment.slice(0, middle) + replacement + segment.slice(middle + 1);
  return segments.join('.');
}

describe('chiffrement de la session', () => {
  it('rend à l’ouverture exactement ce qui a été scellé', async () => {
    const original = session();
    const sealed = await sealSession(original, SECRET);
    expect(await openSession(sealed, SECRET, NOW + 10)).toEqual(original);
  });

  it('ne laisse rien lire dans le cookie', async () => {
    const sealed = await sealSession(session(), SECRET);
    const decoded = sealed
      .split('.')
      .map((part) => Buffer.from(part, 'base64url').toString('latin1'))
      .join('\n');

    for (const leak of [
      'Karim',
      'economy.write',
      'asc_rt_secret_refresh_token_value',
      '0192f3a1',
    ]) {
      expect(sealed).not.toContain(leak);
      expect(decoded).not.toContain(leak);
    }
    // Seul l'en-tête protégé est lisible, et il ne dit que l'algorithme.
    expect(JSON.parse(Buffer.from(sealed.split('.')[0] ?? '', 'base64url').toString())).toEqual({
      alg: 'dir',
      enc: 'A256GCM',
    });
  });

  it('produit un chiffré différent à chaque scellement (vecteur d’initialisation aléatoire)', async () => {
    const payload = session();
    expect(await sealSession(payload, SECRET)).not.toBe(await sealSession(payload, SECRET));
  });

  it('tient dans un cookie, jeton d’identité compris', async () => {
    const sealed = await sealSession(session({ idToken: 'x'.repeat(900) }), SECRET);
    expect(sealed.length).toBeLessThanOrEqual(COOKIE_VALUE_MAX_LENGTH);
  });

  it('abandonne le jeton d’identité plutôt que de dépasser la taille d’un cookie', async () => {
    // Cas extrême : un jeton d'identité très long et beaucoup de rôles aux noms longs.
    const roles = Array.from({ length: 30 }, (_, index) => `role-${index}-${'r'.repeat(50)}`);
    const sealed = await sealSession(session({ idToken: 'x'.repeat(2000), roles }), SECRET);
    expect(sealed.length).toBeLessThanOrEqual(COOKIE_VALUE_MAX_LENGTH);

    const opened = await openSession(sealed, SECRET, NOW + 10);
    expect(opened?.idToken).toBeUndefined();
    expect(opened?.refreshToken).toBe('asc_rt_secret_refresh_token_value');
  });
});

describe('cookie altéré', () => {
  it('refuse un cookie dont un seul caractère a changé, où que ce soit', async () => {
    const sealed = await sealSession(session(), SECRET);
    // 0 : en-tête, 2 : vecteur d'initialisation, 3 : chiffré, 4 : étiquette d'authentification.
    for (const segmentIndex of [0, 2, 3, 4]) {
      expect(await openSession(tamper(sealed, segmentIndex), SECRET, NOW + 10)).toBeNull();
    }
  });

  it('refuse un cookie scellé avec un autre secret', async () => {
    const sealed = await sealSession(session(), OTHER_SECRET);
    expect(await openSession(sealed, SECRET, NOW + 10)).toBeNull();
  });

  it('refuse un JWT non chiffré forgé à la main (alg none)', async () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const forged = `${encode({ alg: 'none' })}.${encode({ ...session(), exp: NOW + 3600, iat: NOW, aud: 'session' })}.`;
    expect(await openSession(forged, SECRET, NOW + 10)).toBeNull();
  });

  it('refuse les valeurs vides, absentes ou démesurées', async () => {
    expect(await openSession(null, SECRET, NOW)).toBeNull();
    expect(await openSession(undefined, SECRET, NOW)).toBeNull();
    expect(await openSession('', SECRET, NOW)).toBeNull();
    expect(await openSession('pas-un-jwe', SECRET, NOW)).toBeNull();
    expect(await openSession('a'.repeat(COOKIE_VALUE_MAX_LENGTH + 1), SECRET, NOW)).toBeNull();
  });

  it('refuse un cookie de transaction présenté comme une session, et l’inverse', async () => {
    const transaction: SignInTransaction = {
      state: 's'.repeat(43),
      nonce: 'n'.repeat(43),
      codeVerifier: 'v'.repeat(64),
      redirectUri: 'https://enderium.test.example/auth/callback',
      returnTo: '/console',
      createdAt: NOW,
    };
    const sealedTransaction = await sealTransaction(transaction, SECRET);
    const sealedSession = await sealSession(session(), SECRET);

    expect(await openSession(sealedTransaction, SECRET, NOW + 10)).toBeNull();
    expect(await openTransaction(sealedSession, SECRET, NOW + 10)).toBeNull();
    expect(await openTransaction(sealedTransaction, SECRET, NOW + 10)).toEqual(transaction);
  });

  it('refuse un contenu authentique mais hors contrat (permission inconnue)', async () => {
    const payload = { ...session(), permissions: ['console.access', 'server.shutdown'] };
    await expect(sealSession(payload as unknown as SessionPayload, SECRET)).rejects.toThrow();
  });
});

describe('expiration', () => {
  it('accepte la session jusqu’à la fin de l’inactivité tolérée, pas après', async () => {
    const sealed = await sealSession(session(), SECRET);
    expect(await openSession(sealed, SECRET, NOW + SESSION_IDLE_TTL - 1)).not.toBeNull();
    expect(await openSession(sealed, SECRET, NOW + SESSION_IDLE_TTL)).toBeNull();
    expect(await openSession(sealed, SECRET, NOW + SESSION_IDLE_TTL + 3600)).toBeNull();
  });

  it('ne laisse jamais une session dépasser huit heures', async () => {
    expect(SESSION_ABSOLUTE_TTL).toBe(8 * 60 * 60);

    // Session renouvelée jusqu'au bout : l'inactivité est plafonnée par l'échéance absolue.
    const lastRenewal = NOW + SESSION_ABSOLUTE_TTL - 60;
    const sealed = await sealSession(
      session({ checkedAt: lastRenewal, expiresAt: NOW + SESSION_ABSOLUTE_TTL }),
      SECRET,
    );
    expect(await openSession(sealed, SECRET, NOW + SESSION_ABSOLUTE_TTL - 1)).not.toBeNull();
    expect(await openSession(sealed, SECRET, NOW + SESSION_ABSOLUTE_TTL)).toBeNull();
  });

  it('refuse une session dont les échéances sont incohérentes', async () => {
    const beyondAbsolute = await sealSession(
      session({ expiresAt: NOW + SESSION_ABSOLUTE_TTL + 60 }),
      SECRET,
    );
    expect(await openSession(beyondAbsolute, SECRET, NOW + 10)).toBeNull();

    const tooLong = await sealSession(
      session({ absoluteExpiresAt: NOW + SESSION_ABSOLUTE_TTL + 3600 }),
      SECRET,
    );
    expect(await openSession(tooLong, SECRET, NOW + 10)).toBeNull();
  });

  it('fait expirer la transaction de connexion au bout de dix minutes', async () => {
    const sealed = await sealTransaction(
      {
        state: 's'.repeat(43),
        nonce: 'n'.repeat(43),
        codeVerifier: 'v'.repeat(64),
        redirectUri: 'https://enderium.test.example/auth/callback',
        returnTo: '/console',
        createdAt: NOW,
      },
      SECRET,
    );
    expect(await openTransaction(sealed, SECRET, NOW + TRANSACTION_TTL - 1)).not.toBeNull();
    expect(await openTransaction(sealed, SECRET, NOW + TRANSACTION_TTL)).toBeNull();
  });
});

describe('fraîcheur des droits', () => {
  const options = { devAuth: false };

  it('demande un renouvellement après cinq minutes', () => {
    const payload = session();
    expect(sessionStanding(payload, { ...options, now: NOW + RIGHTS_REFRESH_AFTER })).toBe('fresh');
    expect(sessionStanding(payload, { ...options, now: NOW + RIGHTS_REFRESH_AFTER + 1 })).toBe(
      'refresh-due',
    );
  });

  it('refuse des droits non confirmés depuis plus de quinze minutes', () => {
    const payload = session();
    expect(sessionStanding(payload, { ...options, now: NOW + RIGHTS_MAX_AGE })).toBe('refresh-due');
    expect(sessionStanding(payload, { ...options, now: NOW + RIGHTS_MAX_AGE + 1 })).toBe('stale');
  });

  it('se resserre quand l’appelant exige des droits plus frais', () => {
    expect(sessionStanding(session(), { ...options, now: NOW + 61, maxAge: 60 })).toBe('stale');
  });

  it('n’accepte une session de développement que si le mode est ouvert', () => {
    const dev = session({ dev: true, refreshToken: undefined });
    expect(sessionStanding(dev, { devAuth: true, now: NOW + 7 * 3600 })).toBe('fresh');
    expect(sessionStanding(dev, { devAuth: false, now: NOW + 1 })).toBe('rejected');
  });
});

describe('utilisateur de la console', () => {
  it('expose le contrat attendu par les pages', () => {
    const user = toConsoleUser(session());
    expect(user).toEqual({
      id: '0192f3a1-0000-7000-8000-000000000001',
      displayName: 'Karim',
      avatarUrl: 'https://cdn.test.example/avatars/karim.png',
      minecraftUuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
      roles: ['admin'],
      permissions: new Set(['console.access', 'economy.read', 'economy.write']),
    });
    // Ni jeton, ni échéance : rien de ce qui sert au serveur ne part vers les pages.
    expect(Object.keys(user).sort()).toEqual(
      ['avatarUrl', 'displayName', 'id', 'minecraftUuid', 'permissions', 'roles'].sort(),
    );
  });
});
