/**
 * Faux fournisseur OpenID Connect pour les tests : il signe de vrais jetons
 * ES256 avec une clé tirée pour l'occasion, et répond aux requêtes que le SDK
 * envoie (échange du code, renouvellement, profil).
 */

import type { DiscoveryDocument, FetchLike } from '@ascencia/id-core';
import {
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from 'jose';
import type { AscenciaSettings } from '../../src/server/auth/config';

export const ISSUER = 'https://id.test.example';
export const APP_ORIGIN = 'https://enderium.test.example';
export const SETTINGS: AscenciaSettings = {
  issuer: ISSUER,
  clientId: 'asc_cid_enderium_test',
  clientSecret: 'asc_cs_test_secret_value',
  redirectUri: `${APP_ORIGIN}/auth/callback`,
};
export const ACCOUNT_ID = '0192f3a1-0000-7000-8000-000000000001';

export interface TokenOverrides {
  accessClaims?: Record<string, unknown>;
  idClaims?: Record<string, unknown>;
  /** Signer le jeton d'identité avec une clé étrangère. */
  foreignIdTokenKey?: boolean;
  omitIdToken?: boolean;
  omitRefreshToken?: boolean;
}

export interface FakeProvider {
  metadata: DiscoveryDocument;
  keyResolver: JWTVerifyGetKey;
  fetch: FetchLike;
  /** Requêtes reçues par le point d'accès jeton, dans l'ordre. */
  tokenRequests: URLSearchParams[];
  /** Jetons présentés à la révocation. */
  revoked: string[];
  /** Simule le passage par l'écran d'autorisation : rend le code à présenter. */
  authorize(authorizeUrl: string): { code: string; state: string };
  /** Ce que le prochain échange ou renouvellement renverra. */
  next: TokenOverrides;
  /** Rôles et permissions du compte, relus à chaque émission. */
  account: { roles: string[]; perms: string[]; name: string; picture: string | null };
  /** `'down'` : le réseau tombe ; `'revoked'` : le renouvellement est refusé. */
  mode: 'up' | 'down' | 'revoked';
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Buffer.from(digest).toString('base64url');
}

export async function createFakeProvider(): Promise<FakeProvider> {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const foreign = await generateKeyPair('ES256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
  const keyResolver = createLocalJWKSet({ keys: [jwk] });

  const codes = new Map<string, { challenge: string; nonce: string }>();
  const refreshTokens = new Set<string>();
  let counter = 0;

  const sign = (claims: JWTPayload, key: CryptoKey = privateKey) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: 'test-key' }).sign(key);

  const provider: FakeProvider = {
    metadata: {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/oauth/token`,
      userinfo_endpoint: `${ISSUER}/oauth/userinfo`,
      end_session_endpoint: `${ISSUER}/oauth/logout`,
      revocation_endpoint: `${ISSUER}/oauth/revoke`,
      code_challenge_methods_supported: ['S256'],
    },
    keyResolver,
    tokenRequests: [],
    revoked: [],
    next: {},
    account: {
      roles: ['moderator'],
      perms: ['console.access', 'players.read', 'moderation.read', 'journal.read'],
      name: 'Karim',
      picture: 'https://cdn.test.example/avatars/karim.png',
    },
    mode: 'up',

    authorize(authorizeUrl) {
      const url = new URL(authorizeUrl);
      counter += 1;
      const code = `code-${counter}`;
      codes.set(code, {
        challenge: url.searchParams.get('code_challenge') ?? '',
        nonce: url.searchParams.get('nonce') ?? '',
      });
      return { code, state: url.searchParams.get('state') ?? '' };
    },

    async fetch(input, init) {
      if (provider.mode === 'down') throw new TypeError('fetch failed');
      const url = new URL(input);

      if (url.pathname === '/oauth/userinfo') {
        return Response.json({
          sub: ACCOUNT_ID,
          name: provider.account.name,
          picture: provider.account.picture ?? undefined,
        });
      }

      const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');

      if (url.pathname === '/oauth/revoke') {
        provider.revoked.push(form.get('token') ?? '');
        return new Response(null, { status: 200 });
      }

      if (url.pathname !== '/oauth/token') return new Response('not found', { status: 404 });

      provider.tokenRequests.push(form);
      const refuse = (error: string, status = 400) =>
        Response.json({ error, error_description: error }, { status });

      if (form.get('client_secret') !== SETTINGS.clientSecret) return refuse('invalid_client', 401);

      let nonce: string | undefined;
      if (form.get('grant_type') === 'authorization_code') {
        const code = form.get('code') ?? '';
        const issued = codes.get(code);
        codes.delete(code);
        if (!issued) return refuse('invalid_grant');
        if ((await sha256Base64Url(form.get('code_verifier') ?? '')) !== issued.challenge) {
          return refuse('invalid_grant');
        }
        nonce = issued.nonce;
      } else if (form.get('grant_type') === 'refresh_token') {
        const presented = form.get('refresh_token') ?? '';
        if (provider.mode === 'revoked' || !refreshTokens.delete(presented)) {
          return refuse('invalid_grant');
        }
      } else {
        return refuse('unsupported_grant_type');
      }

      const overrides = provider.next;
      provider.next = {};
      const issuedAt = Math.floor(Date.now() / 1000);
      const base = {
        iss: ISSUER,
        sub: ACCOUNT_ID,
        aud: SETTINGS.clientId,
        iat: issuedAt,
        exp: issuedAt + 600,
      };

      const accessToken = await sign({
        ...base,
        azp: SETTINGS.clientId,
        sid: 'sso-session-1',
        realm: 'ascencia-internal',
        app: 'enderium',
        scope: 'openid profile offline_access ascencia.roles ascencia.perms',
        roles: provider.account.roles,
        perms: provider.account.perms,
        mship: { st: 'active' },
        ...overrides.accessClaims,
      });
      const idToken = await sign(
        {
          ...base,
          sid: 'sso-session-1',
          nonce,
          roles: provider.account.roles,
          ...overrides.idClaims,
        },
        overrides.foreignIdTokenKey ? foreign.privateKey : undefined,
      );

      counter += 1;
      const refreshToken = `asc_rt_${counter}`;
      refreshTokens.add(refreshToken);

      return Response.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 600,
        scope: 'openid profile offline_access ascencia.roles ascencia.perms',
        ...(overrides.omitIdToken ? {} : { id_token: idToken }),
        ...(overrides.omitRefreshToken ? {} : { refresh_token: refreshToken }),
      });
    },
  };

  return provider;
}
