import { beforeEach, describe, expect, it } from 'vitest';
import { SignInError } from '../../src/server/auth/errors';
import { type OidcFlow, OIDC_SCOPES, createOidcFlow } from '../../src/server/auth/oidc';
import type { SignInTransaction } from '../../src/server/auth/session';
import {
  ACCOUNT_ID,
  APP_ORIGIN,
  type FakeProvider,
  ISSUER,
  SETTINGS,
  createFakeProvider,
} from './fake-provider';

let provider: FakeProvider;
let flow: OidcFlow;

beforeEach(async () => {
  provider = await createFakeProvider();
  flow = createOidcFlow(SETTINGS, {
    fetch: provider.fetch,
    keyResolver: provider.keyResolver,
    metadata: provider.metadata,
  });
});

/** Du départ jusqu'au retour : rend les paramètres de l'URL de retour et la transaction. */
async function goThroughProvider(): Promise<{
  params: URLSearchParams;
  transaction: SignInTransaction;
}> {
  const { authorizeUrl, transaction } = await flow.beginSignIn({ returnTo: '/console/players' });
  const { code, state } = provider.authorize(authorizeUrl);
  return { params: new URLSearchParams({ code, state, iss: ISSUER }), transaction };
}

async function expectSignInError(promise: Promise<unknown>, code: string): Promise<void> {
  const failure = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(SignInError);
  expect((failure as SignInError).code).toBe(code);
}

describe('départ vers Ascencia ID', () => {
  it('demande code + PKCE S256, state, nonce, et les scopes des droits', async () => {
    const { authorizeUrl, transaction } = await flow.beginSignIn({ returnTo: '/console' });
    const url = new URL(authorizeUrl);

    expect(url.origin + url.pathname).toBe(`${ISSUER}/oauth/authorize`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(SETTINGS.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(SETTINGS.redirectUri);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([...OIDC_SCOPES]);
    expect(url.searchParams.get('scope')).toContain('ascencia.perms');
    expect(url.searchParams.get('scope')).toContain('offline_access');

    expect(url.searchParams.get('state')).toBe(transaction.state);
    expect(url.searchParams.get('nonce')).toBe(transaction.nonce);
    // Le vérificateur PKCE et le secret du client ne voyagent jamais dans l'URL.
    expect(authorizeUrl).not.toContain(transaction.codeVerifier);
    expect(authorizeUrl).not.toContain(SETTINGS.clientSecret);
  });

  it('tire un state, un nonce et un vérificateur neufs à chaque départ', async () => {
    const first = await flow.beginSignIn({ returnTo: '/console' });
    const second = await flow.beginSignIn({ returnTo: '/console' });
    expect(second.transaction.state).not.toBe(first.transaction.state);
    expect(second.transaction.nonce).not.toBe(first.transaction.nonce);
    expect(second.transaction.codeVerifier).not.toBe(first.transaction.codeVerifier);
  });
});

describe('retour d’Ascencia ID', () => {
  it('échange le code et traduit le jeton en droits de la console', async () => {
    const { params, transaction } = await goThroughProvider();
    const grant = await flow.completeSignIn(params, transaction);

    expect(grant.sub).toBe(ACCOUNT_ID);
    expect(grant.sid).toBe('sso-session-1');
    expect(grant.roles).toEqual(['moderator']);
    expect(grant.permissions).toEqual([
      'console.access',
      'players.read',
      'moderation.read',
      'journal.read',
    ]);
    expect(grant.profile).toEqual({
      name: 'Karim',
      avatar: 'https://cdn.test.example/avatars/karim.png',
    });
    expect(grant.minecraftUuid).toBeNull();
    expect(grant.refreshToken).toMatch(/^asc_rt_/);
    expect(grant.idToken).toBeTruthy();

    const request = provider.tokenRequests[0];
    expect(request?.get('grant_type')).toBe('authorization_code');
    expect(request?.get('code_verifier')).toBe(transaction.codeVerifier);
    expect(request?.get('redirect_uri')).toBe(SETTINGS.redirectUri);
  });

  it('refuse un state qui ne correspond pas, sans rien échanger', async () => {
    const { params, transaction } = await goThroughProvider();
    params.set('state', 'un-autre-state-venu-d-ailleurs');
    await expectSignInError(flow.completeSignIn(params, transaction), 'invalid_state');
    expect(provider.tokenRequests).toHaveLength(0);
  });

  it('refuse un retour signé par un autre émetteur', async () => {
    const { params, transaction } = await goThroughProvider();
    params.set('iss', 'https://id.attacker.example');
    await expectSignInError(flow.completeSignIn(params, transaction), 'invalid_state');
    expect(provider.tokenRequests).toHaveLength(0);
  });

  it('refuse un code échangé avec un autre vérificateur PKCE', async () => {
    const { params, transaction } = await goThroughProvider();
    const stolen = { ...transaction, codeVerifier: 'x'.repeat(64) };
    await expectSignInError(flow.completeSignIn(params, stolen), 'exchange_failed');
  });

  it('refuse un jeton d’identité dont le nonce n’est pas celui de la demande', async () => {
    const { params, transaction } = await goThroughProvider();
    provider.next = { idClaims: { nonce: 'nonce-d-une-autre-demande-0000' } };
    await expectSignInError(flow.completeSignIn(params, transaction), 'invalid_token');
  });

  it('refuse un jeton d’identité signé par une autre clé', async () => {
    const { params, transaction } = await goThroughProvider();
    provider.next = { foreignIdTokenKey: true };
    await expectSignInError(flow.completeSignIn(params, transaction), 'invalid_token');
  });

  it('refuse un jeton d’identité émis pour une autre application', async () => {
    const { params, transaction } = await goThroughProvider();
    provider.next = { idClaims: { aud: 'asc_cid_autre_site' } };
    await expectSignInError(flow.completeSignIn(params, transaction), 'invalid_token');
  });

  it('refuse un jeton d’identité émis par un autre émetteur', async () => {
    const { params, transaction } = await goThroughProvider();
    provider.next = { idClaims: { iss: 'https://id.attacker.example' } };
    await expectSignInError(flow.completeSignIn(params, transaction), 'invalid_token');
  });

  it('refuse un jeton d’identité périmé', async () => {
    const { params, transaction } = await goThroughProvider();
    const past = Math.floor(Date.now() / 1000) - 3600;
    provider.next = { idClaims: { iat: past - 600, exp: past } };
    await expectSignInError(flow.completeSignIn(params, transaction), 'invalid_token');
  });

  it('refuse une réponse sans jeton d’identité', async () => {
    const { params, transaction } = await goThroughProvider();
    provider.next = { omitIdToken: true };
    await expectSignInError(flow.completeSignIn(params, transaction), 'invalid_token');
  });

  it('refuse deux jetons qui ne parlent pas de la même personne', async () => {
    const { params, transaction } = await goThroughProvider();
    provider.next = { idClaims: { sub: 'un-autre-compte' } };
    await expectSignInError(flow.completeSignIn(params, transaction), 'invalid_token');
  });

  it('refuse d’inventer des droits quand le jeton n’en transporte pas', async () => {
    const first = await goThroughProvider();
    provider.next = { accessClaims: { perms: undefined } };
    await expectSignInError(
      flow.completeSignIn(first.params, first.transaction),
      'permissions_unavailable',
    );

    const second = await goThroughProvider();
    provider.next = { accessClaims: { perms: undefined, perms_truncated: true } };
    await expectSignInError(
      flow.completeSignIn(second.params, second.transaction),
      'permissions_unavailable',
    );
  });

  it('refuse une session d’assistance ouverte au nom d’un autre compte', async () => {
    const { params, transaction } = await goThroughProvider();
    provider.next = { accessClaims: { act: { sub: 'admin-ascencia' } } };
    await expectSignInError(flow.completeSignIn(params, transaction), 'impersonation_refused');
  });

  it('refuse un membre banni ou en attente', async () => {
    const { params, transaction } = await goThroughProvider();
    provider.next = { accessClaims: { mship: { st: 'banned' } } };
    await expectSignInError(flow.completeSignIn(params, transaction), 'access_denied');
  });

  it('relaie le refus d’accès prononcé par le fournisseur', async () => {
    const { transaction } = await flow.beginSignIn({ returnTo: '/console' });
    const params = new URLSearchParams({ error: 'access_denied', state: transaction.state });
    await expectSignInError(flow.completeSignIn(params, transaction), 'access_denied');
  });

  it('signale un fournisseur injoignable sans le confondre avec un refus', async () => {
    const { params, transaction } = await goThroughProvider();
    provider.mode = 'down';
    await expectSignInError(flow.completeSignIn(params, transaction), 'provider_unavailable');
  });

  it('lit l’UUID Minecraft quand le fournisseur le transmet', async () => {
    const { params, transaction } = await goThroughProvider();
    provider.next = { accessClaims: { minecraft_uuid: '069A79F444E94726A5BEFCA90E38AAF5' } };
    const grant = await flow.completeSignIn(params, transaction);
    expect(grant.minecraftUuid).toBe('069a79f4-44e9-4726-a5be-fca90e38aaf5');
  });

  it('écarte une adresse d’avatar qui n’est pas une URL https', async () => {
    const { params, transaction } = await goThroughProvider();
    provider.account.picture = 'javascript:alert(1)';
    const grant = await flow.completeSignIn(params, transaction);
    expect(grant.profile?.avatar).toBeNull();
  });
});

describe('renouvellement des droits', () => {
  async function signIn() {
    const { params, transaction } = await goThroughProvider();
    return flow.completeSignIn(params, transaction);
  }

  it('rend les droits du moment : un rôle retiré disparaît au renouvellement suivant', async () => {
    const grant = await signIn();
    provider.account.roles = [];
    provider.account.perms = [];

    const outcome = await flow.refresh(grant.refreshToken as string);
    expect(outcome.kind).toBe('renewed');
    if (outcome.kind !== 'renewed') return;
    expect(outcome.grant.roles).toEqual([]);
    expect(outcome.grant.permissions).toEqual([]);
    // Le jeton a tourné : l'ancien ne doit plus servir.
    expect(outcome.grant.refreshToken).not.toBe(grant.refreshToken);
    expect(provider.tokenRequests.at(-1)?.get('grant_type')).toBe('refresh_token');
    expect(provider.tokenRequests.at(-1)?.get('refresh_token')).toBe(grant.refreshToken);
  });

  it('classe un refus du fournisseur comme une fin de session', async () => {
    const grant = await signIn();
    provider.mode = 'revoked';
    expect(await flow.refresh(grant.refreshToken as string)).toEqual({ kind: 'rejected' });
  });

  it('classe une panne réseau comme une indisponibilité, pas comme un refus', async () => {
    const grant = await signIn();
    provider.mode = 'down';
    expect(await flow.refresh(grant.refreshToken as string)).toEqual({ kind: 'unavailable' });
  });

  it('met fin à la session si le jeton renouvelé ne transporte plus de droits', async () => {
    const grant = await signIn();
    provider.next = { accessClaims: { perms: undefined } };
    expect(await flow.refresh(grant.refreshToken as string)).toEqual({ kind: 'rejected' });
  });
});

describe('déconnexion chez le fournisseur', () => {
  it('révoque le jeton de renouvellement', async () => {
    await flow.revoke('asc_rt_a_revoquer');
    expect(provider.revoked).toEqual(['asc_rt_a_revoquer']);
  });

  it('construit l’adresse de fin de session avec le jeton d’identité en preuve', async () => {
    const target = new URL(
      await flow.endSessionUrl({
        idToken: 'jeton.d.identite',
        postLogoutRedirectUri: `${APP_ORIGIN}/sign-in`,
      }),
    );
    expect(target.origin + target.pathname).toBe(`${ISSUER}/oauth/logout`);
    expect(target.searchParams.get('id_token_hint')).toBe('jeton.d.identite');
    expect(target.searchParams.get('post_logout_redirect_uri')).toBe(`${APP_ORIGIN}/sign-in`);
  });
});
