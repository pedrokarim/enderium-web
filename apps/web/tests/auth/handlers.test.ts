import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AuthConfig, parseAuthConfig } from '../../src/server/auth/config';
import {
  handleCallback,
  handleDevSignIn,
  handleSignIn,
  handleSignOut,
} from '../../src/server/auth/handlers';
import { createOidcFlow } from '../../src/server/auth/oidc';
import type { AuthRuntime } from '../../src/server/auth/runtime';
import {
  SESSION_ABSOLUTE_TTL,
  SESSION_IDLE_TTL,
  openSession,
  openTransaction,
} from '../../src/server/auth/session';
import {
  ACCOUNT_ID,
  APP_ORIGIN,
  type FakeProvider,
  ISSUER,
  SETTINGS,
  createFakeProvider,
} from './fake-provider';

const SESSION_SECRET = 'k3Jx9Qm2Vt7Lp0Zr5Ny8Hb4Wd1Fs6Gc3Ua9Ei2Ox7Tq';
const SESSION_COOKIE = '__Host-enderium_session';
const TRANSACTION_COOKIE = '__Host-enderium_sign_in';

const PRODUCTION_CONFIG: AuthConfig = {
  production: true,
  appOrigin: APP_ORIGIN,
  sessionSecret: SESSION_SECRET,
  ascencia: SETTINGS,
  devAuth: false,
  secureCookies: true,
};

const DEV_CONFIG: AuthConfig = {
  production: false,
  appOrigin: 'http://localhost:3100',
  sessionSecret: SESSION_SECRET,
  ascencia: null,
  devAuth: true,
  secureCookies: false,
};

let provider: FakeProvider;
let runtime: AuthRuntime;
const now = () => Math.floor(Date.now() / 1000);

beforeEach(async () => {
  provider = await createFakeProvider();
  runtime = {
    config: PRODUCTION_CONFIG,
    flow: createOidcFlow(SETTINGS, {
      fetch: provider.fetch,
      keyResolver: provider.keyResolver,
      metadata: provider.metadata,
    }),
    now,
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Les cookies posés par une réponse : nom → { valeur, attributs }. */
function cookiesOf(response: Response): Map<string, { value: string; attributes: string[] }> {
  const jar = new Map<string, { value: string; attributes: string[] }>();
  for (const header of response.headers.getSetCookie()) {
    const [pair = '', ...attributes] = header.split('; ');
    const separator = pair.indexOf('=');
    jar.set(pair.slice(0, separator), { value: pair.slice(separator + 1), attributes });
  }
  return jar;
}

function post(path: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(`${APP_ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}

/** Parcours complet : rend la réponse du retour et le cookie de session. */
async function signIn(returnTo = '/console/players?page=2') {
  const start = await handleSignIn(
    new Request(`${APP_ORIGIN}/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`),
    runtime,
  );
  const transactionCookie = cookiesOf(start).get(TRANSACTION_COOKIE);
  const { code, state } = provider.authorize(start.headers.get('location') ?? '');

  const callback = await handleCallback(
    new Request(`${APP_ORIGIN}/auth/callback?code=${code}&state=${state}&iss=${ISSUER}`, {
      headers: { cookie: `${TRANSACTION_COOKIE}=${transactionCookie?.value}` },
    }),
    runtime,
  );
  return { start, callback, session: cookiesOf(callback).get(SESSION_COOKIE) };
}

describe('GET /auth/sign-in', () => {
  it('part vers Ascencia ID et garde la transaction dans un cookie court, chiffré, httpOnly', async () => {
    const response = await handleSignIn(
      new Request(`${APP_ORIGIN}/auth/sign-in?returnTo=/console/economy`),
      runtime,
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe(ISSUER);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const cookie = cookiesOf(response).get(TRANSACTION_COOKIE);
    expect(cookie?.attributes).toEqual([
      'Path=/',
      'Max-Age=600',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
    ]);

    // Ni le state ni le vérificateur ne se lisent dans le cookie.
    const state = location.searchParams.get('state') ?? '';
    expect(cookie?.value).not.toContain(state);

    const transaction = await openTransaction(cookie?.value, SESSION_SECRET);
    expect(transaction?.state).toBe(state);
    expect(transaction?.returnTo).toBe('/console/economy');
  });

  it('ne garde pas une destination de retour externe', async () => {
    const response = await handleSignIn(
      new Request(`${APP_ORIGIN}/auth/sign-in?returnTo=https://evil.example/console`),
      runtime,
    );
    const transaction = await openTransaction(
      cookiesOf(response).get(TRANSACTION_COOKIE)?.value,
      SESSION_SECRET,
    );
    expect(transaction?.returnTo).toBe('/console');
  });

  it('renvoie vers la page de connexion quand Ascencia ID n’est pas configuré', async () => {
    const response = await handleSignIn(new Request('http://localhost:3100/auth/sign-in'), {
      config: DEV_CONFIG,
      flow: null,
      now,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3100/sign-in?error=not_configured',
    );
  });

  it('renvoie vers la page de connexion quand le fournisseur est injoignable', async () => {
    // Sans document de découverte fourni, le SDK va le chercher : le réseau tombe.
    provider.mode = 'down';
    const flow = createOidcFlow(
      { ...SETTINGS, issuer: 'https://id.unreachable.example' },
      { fetch: provider.fetch, keyResolver: provider.keyResolver },
    );
    const response = await handleSignIn(new Request(`${APP_ORIGIN}/auth/sign-in`), {
      ...runtime,
      flow,
    });
    expect(response.headers.get('location')).toBe(
      `${APP_ORIGIN}/sign-in?error=provider_unavailable`,
    );
  });
});

describe('GET /auth/callback', () => {
  it('ouvre une session bornée et revient à la page demandée', async () => {
    const { callback, session } = await signIn();

    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe(`${APP_ORIGIN}/console/players?page=2`);
    expect(callback.headers.get('cache-control')).toBe('no-store');
    expect(callback.headers.get('referrer-policy')).toBe('no-referrer');

    expect(session?.attributes).toEqual([
      'Path=/',
      `Max-Age=${SESSION_IDLE_TTL}`,
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
    ]);

    const opened = await openSession(session?.value, SESSION_SECRET);
    expect(opened).toMatchObject({
      sub: ACCOUNT_ID,
      name: 'Karim',
      roles: ['moderator'],
      permissions: ['console.access', 'players.read', 'moderation.read', 'journal.read'],
      sid: 'sso-session-1',
    });
    expect(opened?.refreshToken).toMatch(/^asc_rt_/);
    expect((opened?.absoluteExpiresAt ?? 0) - (opened?.startedAt ?? 0)).toBe(SESSION_ABSOLUTE_TTL);

    // La transaction ne sert qu'une fois.
    expect(cookiesOf(callback).get(TRANSACTION_COOKIE)).toEqual({
      value: '',
      attributes: ['Path=/', 'Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=Lax'],
    });
  });

  it('refuse un retour sans cookie de transaction (demande partie d’un autre navigateur)', async () => {
    const start = await handleSignIn(new Request(`${APP_ORIGIN}/auth/sign-in`), runtime);
    const { code, state } = provider.authorize(start.headers.get('location') ?? '');

    const response = await handleCallback(
      new Request(`${APP_ORIGIN}/auth/callback?code=${code}&state=${state}`),
      runtime,
    );
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/sign-in?error=invalid_state`);
    expect(cookiesOf(response).has(SESSION_COOKIE)).toBe(false);
    expect(provider.tokenRequests).toHaveLength(0);
  });

  it('refuse un cookie de transaction altéré', async () => {
    const start = await handleSignIn(new Request(`${APP_ORIGIN}/auth/sign-in`), runtime);
    const { code, state } = provider.authorize(start.headers.get('location') ?? '');
    const cookie = cookiesOf(start).get(TRANSACTION_COOKIE)?.value ?? '';
    const altered = `${cookie.slice(0, -6)}${cookie.at(-6) === 'A' ? 'B' : 'A'}${cookie.slice(-5)}`;

    const response = await handleCallback(
      new Request(`${APP_ORIGIN}/auth/callback?code=${code}&state=${state}`, {
        headers: { cookie: `${TRANSACTION_COOKIE}=${altered}` },
      }),
      runtime,
    );
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/sign-in?error=invalid_state`);
    expect(cookiesOf(response).has(SESSION_COOKIE)).toBe(false);
  });

  it('refuse le state d’une autre demande', async () => {
    const first = await handleSignIn(new Request(`${APP_ORIGIN}/auth/sign-in`), runtime);
    const second = await handleSignIn(new Request(`${APP_ORIGIN}/auth/sign-in`), runtime);
    const stolen = provider.authorize(second.headers.get('location') ?? '');

    const response = await handleCallback(
      new Request(`${APP_ORIGIN}/auth/callback?code=${stolen.code}&state=${stolen.state}`, {
        headers: {
          cookie: `${TRANSACTION_COOKIE}=${cookiesOf(first).get(TRANSACTION_COOKIE)?.value}`,
        },
      }),
      runtime,
    );
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/sign-in?error=invalid_state`);
    expect(cookiesOf(response).has(SESSION_COOKIE)).toBe(false);
  });

  it('n’ouvre aucune session quand le jeton d’identité est invalide', async () => {
    provider.next = { foreignIdTokenKey: true };
    const { callback, session } = await signIn('/console');
    expect(callback.headers.get('location')).toBe(`${APP_ORIGIN}/sign-in?error=invalid_token`);
    expect(session).toBeUndefined();
  });

  it('ne laisse fuir aucun jeton dans la réponse', async () => {
    const { callback, session } = await signIn();
    const opened = await openSession(session?.value, SESSION_SECRET);
    const visible = [callback.headers.get('location'), ...callback.headers.getSetCookie()].join(
      '\n',
    );
    expect(visible).not.toContain(opened?.refreshToken);
    expect(visible).not.toContain(opened?.idToken);
    expect(visible).not.toContain(SETTINGS.clientSecret);
  });
});

describe('POST /auth/sign-out', () => {
  it('efface la session, révoque le jeton de renouvellement et revient à la connexion', async () => {
    const { session } = await signIn();
    const opened = await openSession(session?.value, SESSION_SECRET);

    const response = await handleSignOut(
      post(
        '/auth/sign-out',
        {},
        { origin: APP_ORIGIN, cookie: `${SESSION_COOKIE}=${session?.value}` },
      ),
      runtime,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/sign-in?signedOut=1`);
    expect(cookiesOf(response).get(SESSION_COOKIE)).toEqual({
      value: '',
      attributes: ['Path=/', 'Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=Lax'],
    });
    expect(provider.revoked).toEqual([opened?.refreshToken]);
  });

  it('part se déconnecter d’Ascencia ID quand le formulaire le demande', async () => {
    const { session } = await signIn();
    const opened = await openSession(session?.value, SESSION_SECRET);

    const response = await handleSignOut(
      post(
        '/auth/sign-out',
        { global: '1' },
        { origin: APP_ORIGIN, cookie: `${SESSION_COOKIE}=${session?.value}` },
      ),
      runtime,
    );
    const target = new URL(response.headers.get('location') ?? '');
    expect(target.origin + target.pathname).toBe(`${ISSUER}/oauth/logout`);
    expect(target.searchParams.get('id_token_hint')).toBe(opened?.idToken);
    expect(target.searchParams.get('post_logout_redirect_uri')).toBe(`${APP_ORIGIN}/sign-in`);
    expect(cookiesOf(response).get(SESSION_COOKIE)?.value).toBe('');
  });

  it.each([
    ['un autre site', { origin: 'https://evil.example' }],
    ['un sous-domaine voisin', { origin: 'https://forum.test.example' }],
    ['le même hôte en http', { origin: 'http://enderium.test.example' }],
    ['une origine opaque', { origin: 'null' }],
    ['une requête inter-sites sans Origin', { 'sec-fetch-site': 'cross-site' }],
    ['aucun indice d’origine', {}],
  ])('refuse un POST venu de : %s', async (_label, headers) => {
    const { session } = await signIn();
    const response = await handleSignOut(
      post('/auth/sign-out', {}, { ...headers, cookie: `${SESSION_COOKIE}=${session?.value}` }),
      runtime,
    );
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(provider.revoked).toEqual([]);
  });

  it('accepte un POST de même origine reconnu par Fetch Metadata ou par Referer', async () => {
    for (const headers of [
      { 'sec-fetch-site': 'same-origin' },
      { referer: `${APP_ORIGIN}/console/players` },
    ]) {
      const response = await handleSignOut(post('/auth/sign-out', {}, headers), runtime);
      expect(response.status).toBe(303);
    }
  });
});

describe('POST /auth/dev-sign-in', () => {
  const devRuntime: AuthRuntime = { config: DEV_CONFIG, flow: null, now };
  const devPost = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
    new Request('http://localhost:3100/auth/dev-sign-in', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost:3100',
        ...headers,
      },
      body: new URLSearchParams(fields).toString(),
    });

  it('ouvre une session « Développeur local » avec tous les droits', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await handleDevSignIn(devPost({ profile: 'full' }), devRuntime);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3100/console');

    const opened = await openSession(
      cookiesOf(response).get('enderium_session')?.value,
      SESSION_SECRET,
    );
    expect(opened).toMatchObject({ sub: 'dev:local', name: 'Développeur local', dev: true });
    expect(opened?.permissions).toContain('economy.write');
    expect(opened?.refreshToken).toBeUndefined();
  });

  it('ouvre le profil lecture seule sans aucune écriture', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await handleDevSignIn(
      devPost({ profile: 'read-only', returnTo: '/console/economy' }),
      devRuntime,
    );
    expect(response.headers.get('location')).toBe('http://localhost:3100/console/economy');

    const opened = await openSession(
      cookiesOf(response).get('enderium_session')?.value,
      SESSION_SECRET,
    );
    expect(opened?.permissions).toContain('economy.read');
    expect(opened?.permissions.some((permission) => permission.endsWith('.write'))).toBe(false);
  });

  it('refuse un profil inconnu et une origine étrangère', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect((await handleDevSignIn(devPost({ profile: 'root' }), devRuntime)).status).toBe(400);
    expect(
      (await handleDevSignIn(devPost({}, { origin: 'https://evil.example' }), devRuntime)).status,
    ).toBe(403);
  });

  it('répond 404 quand le mode développement n’est pas ouvert', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await handleDevSignIn(devPost({}), {
      ...devRuntime,
      config: { ...DEV_CONFIG, devAuth: false },
    });
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  describe('en production', () => {
    it('répond 404 et ne pose aucun cookie, même si la configuration prétend l’ouvrir', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      // Configuration impossible à obtenir par `parseAuthConfig` : on force le
      // pire cas pour prouver que la route ne s'y fie pas.
      const response = await handleDevSignIn(devPost({ profile: 'full' }), devRuntime);
      expect(response.status).toBe(404);
      expect(response.headers.getSetCookie()).toEqual([]);
    });

    it('répond 404 avec la configuration réelle de production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const response = await handleDevSignIn(
        post('/auth/dev-sign-in', { profile: 'full' }, { origin: APP_ORIGIN }),
        runtime,
      );
      expect(response.status).toBe(404);
      expect(response.headers.getSetCookie()).toEqual([]);
    });

    it('répond 404 avec ENDERIUM_DEV_AUTH=1 dans l’environnement, sans configuration injectée', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ENDERIUM_DEV_AUTH', '1');
      vi.stubEnv('APP_URL', 'http://localhost:3100');
      vi.stubEnv('SESSION_SECRET', SESSION_SECRET);

      // La configuration elle-même refuse de se charger…
      expect(() => parseAuthConfig(process.env)).toThrow(/interdit en production/);
      // … et la route reste fermée.
      const response = await handleDevSignIn(devPost({ profile: 'full' }));
      expect(response.status).toBe(404);
      expect(response.headers.getSetCookie()).toEqual([]);
    });

    it('répond 404 si la configuration dit « production » alors que NODE_ENV ne le dit pas', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      const response = await handleDevSignIn(devPost({}), {
        ...devRuntime,
        config: { ...DEV_CONFIG, production: true },
      });
      expect(response.status).toBe(404);
    });
  });
});
