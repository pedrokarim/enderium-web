import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthConfig } from '../../src/server/auth/config';
import { type GateInput, evaluateRequest } from '../../src/server/auth/gate';
import type { OidcFlow, ProviderGrant, RefreshOutcome } from '../../src/server/auth/oidc';
import { type SessionRefresher, createSessionRefresher } from '../../src/server/auth/refresher';
import type { AuthRuntime } from '../../src/server/auth/runtime';
import {
  MUTATION_RIGHTS_MAX_AGE,
  RIGHTS_MAX_AGE,
  RIGHTS_REFRESH_AFTER,
  SESSION_ABSOLUTE_TTL,
  SESSION_IDLE_TTL,
  type SessionPayload,
  sealSession,
} from '../../src/server/auth/session';

const SECRET = 'k3Jx9Qm2Vt7Lp0Zr5Ny8Hb4Wd1Fs6Gc3Ua9Ei2Ox7Tq';
const START = 1_800_000_000;
const ACCOUNT = '0192f3a1-0000-7000-8000-000000000001';

const CONFIG: AuthConfig = {
  production: true,
  appOrigin: 'https://enderium.test.example',
  sessionSecret: SECRET,
  ascencia: {
    issuer: 'https://id.test.example',
    clientId: 'asc_cid_enderium_test',
    clientSecret: 'asc_cs_test',
    redirectUri: 'https://enderium.test.example/auth/callback',
  },
  devAuth: false,
  secureCookies: true,
};

let clock: number;
let refreshCalls: string[];
let nextOutcome: (refreshToken: string) => Promise<RefreshOutcome> | RefreshOutcome;
let runtime: AuthRuntime;
let refresher: SessionRefresher;

function grant(overrides: Partial<ProviderGrant> = {}): ProviderGrant {
  return {
    sub: ACCOUNT,
    sid: 'sso-session-1',
    roles: ['admin'],
    permissions: ['console.access', 'economy.read', 'economy.write'],
    minecraftUuid: null,
    profile: { name: 'Karim', avatar: null },
    refreshToken: `asc_rt_after_${refreshCalls.length}`,
    idToken: null,
    ...overrides,
  };
}

function session(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    sub: ACCOUNT,
    name: 'Karim',
    avatar: null,
    minecraftUuid: null,
    roles: ['admin'],
    permissions: ['console.access', 'economy.read', 'economy.write'],
    startedAt: START,
    expiresAt: START + SESSION_IDLE_TTL,
    absoluteExpiresAt: START + SESSION_ABSOLUTE_TTL,
    checkedAt: START,
    refreshToken: 'asc_rt_initial',
    ...overrides,
  };
}

async function evaluate(
  payload: SessionPayload | null,
  input: Partial<GateInput> = {},
  overrides: Partial<AuthRuntime> = {},
) {
  return evaluateRequest(
    {
      method: 'GET',
      pathname: '/console/players',
      search: '',
      sessionCookie: payload ? await sealSession(payload, SECRET) : null,
      ...input,
    },
    { ...runtime, ...overrides },
    refresher,
  );
}

beforeEach(() => {
  clock = START;
  refreshCalls = [];
  nextOutcome = () => ({ kind: 'renewed', grant: grant() });

  const flow = {
    refresh: async (refreshToken: string) => {
      refreshCalls.push(refreshToken);
      return nextOutcome(refreshToken);
    },
  } as unknown as OidcFlow;

  runtime = { config: CONFIG, flow, now: () => clock };
  refresher = createSessionRefresher({ flow, now: () => clock });
});

describe('sans session', () => {
  it('renvoie /console et /studio vers la connexion, avec le chemin demandé', async () => {
    expect(await evaluate(null, { pathname: '/console/players', search: '?page=2' })).toEqual({
      action: 'redirect',
      location: '/sign-in?returnTo=%2Fconsole%2Fplayers%3Fpage%3D2',
    });
    expect(await evaluate(null, { pathname: '/studio' })).toMatchObject({
      action: 'redirect',
      location: '/sign-in?returnTo=%2Fstudio',
    });
  });

  it('laisse passer le reste du site', async () => {
    for (const pathname of ['/', '/sign-in', '/denied', '/consoleries', '/studios']) {
      expect(await evaluate(null, { pathname })).toEqual({ action: 'pass' });
    }
  });

  it('efface un cookie altéré ou périmé et renvoie vers la connexion', async () => {
    const decision = await evaluateRequest(
      {
        method: 'GET',
        pathname: '/console',
        search: '',
        sessionCookie: 'cookie.trafique.a.la.main',
      },
      runtime,
      refresher,
    );
    expect(decision).toEqual({
      action: 'redirect',
      location: '/sign-in?returnTo=%2Fconsole',
      clearSession: true,
    });

    clock = START + SESSION_IDLE_TTL + 1;
    expect(await evaluate(session())).toMatchObject({ action: 'redirect', clearSession: true });
    expect(refreshCalls).toEqual([]);
  });
});

describe('fraîcheur des droits', () => {
  it('laisse passer sans appeler le fournisseur tant que les droits sont frais', async () => {
    clock = START + RIGHTS_REFRESH_AFTER;
    expect(await evaluate(session())).toEqual({ action: 'pass' });
    expect(refreshCalls).toEqual([]);
  });

  it('redemande les droits après cinq minutes et réécrit la session', async () => {
    clock = START + RIGHTS_REFRESH_AFTER + 1;
    nextOutcome = () => ({
      kind: 'renewed',
      grant: grant({ roles: ['support'], permissions: ['console.access', 'players.read'] }),
    });

    const decision = await evaluate(session());
    expect(decision.action).toBe('pass');
    expect(refreshCalls).toEqual(['asc_rt_initial']);
    expect(decision.session).toMatchObject({
      roles: ['support'],
      permissions: ['console.access', 'players.read'],
      checkedAt: clock,
      refreshToken: 'asc_rt_after_1',
      // L'inactivité est repoussée, l'échéance absolue ne bouge pas.
      expiresAt: clock + SESSION_IDLE_TTL,
      absoluteExpiresAt: START + SESSION_ABSOLUTE_TTL,
      startedAt: START,
    });
  });

  it('retire l’écriture dans la minute : une action serveur exige des droits tout frais', async () => {
    clock = START + MUTATION_RIGHTS_MAX_AGE + 1;
    nextOutcome = () => ({
      kind: 'renewed',
      grant: grant({ roles: ['support'], permissions: ['console.access', 'economy.read'] }),
    });

    // Une lecture au même instant ne dérange pas le fournisseur…
    expect(await evaluate(session())).toEqual({ action: 'pass' });
    expect(refreshCalls).toEqual([]);

    // … une écriture, si : et la page verra la session sans `economy.write`.
    const decision = await evaluate(session(), { method: 'POST', pathname: '/console/economy' });
    expect(refreshCalls).toEqual(['asc_rt_initial']);
    expect(decision.session?.permissions).toEqual(['console.access', 'economy.read']);
  });

  it('met fin à la session quand le fournisseur refuse le renouvellement', async () => {
    clock = START + RIGHTS_REFRESH_AFTER + 1;
    nextOutcome = () => ({ kind: 'rejected' });

    expect(await evaluate(session())).toEqual({
      action: 'redirect',
      location: '/sign-in?returnTo=%2Fconsole%2Fplayers&error=session_ended',
      clearSession: true,
    });
  });

  it('met fin à la session si le fournisseur répond pour un autre compte', async () => {
    clock = START + RIGHTS_REFRESH_AFTER + 1;
    nextOutcome = () => ({ kind: 'renewed', grant: grant({ sub: 'un-autre-compte' }) });
    expect(await evaluate(session())).toMatchObject({ action: 'redirect', clearSession: true });
  });

  it('ne prolonge jamais la session au-delà de son échéance absolue', async () => {
    clock = START + SESSION_ABSOLUTE_TTL - 600;
    const decision = await evaluate(
      session({ checkedAt: clock - 400, expiresAt: START + SESSION_ABSOLUTE_TTL }),
    );
    expect(decision.session?.expiresAt).toBe(START + SESSION_ABSOLUTE_TTL);
  });
});

describe('fournisseur injoignable', () => {
  beforeEach(() => {
    nextOutcome = () => ({ kind: 'unavailable' });
  });

  it('laisse les lectures passer, sans toucher au cookie', async () => {
    clock = START + RIGHTS_REFRESH_AFTER + 1;
    expect(await evaluate(session())).toEqual({ action: 'pass' });
  });

  it('refuse une écriture dont les droits n’ont pas pu être confirmés', async () => {
    clock = START + MUTATION_RIGHTS_MAX_AGE + 1;
    const decision = await evaluate(session(), { method: 'POST', pathname: '/console/economy' });
    expect(decision.action).toBe('unavailable');
    expect(decision.session).toBeUndefined();
  });

  it('garde le jeton qui a tourné quand seules les clés sont injoignables', async () => {
    clock = START + RIGHTS_REFRESH_AFTER + 1;
    nextOutcome = () => ({ kind: 'rotated', refreshToken: 'asc_rt_rotated' });

    const decision = await evaluate(session());
    expect(decision.action).toBe('pass');
    // Nouveau jeton gardé, mais les droits ne sont pas considérés comme revérifiés.
    expect(decision.session).toMatchObject({ refreshToken: 'asc_rt_rotated', checkedAt: START });
  });
});

describe('session sans jeton de renouvellement', () => {
  const bare = () => {
    const payload = session();
    delete payload.refreshToken;
    return payload;
  };

  it('vit quinze minutes, puis repasse par Ascencia ID', async () => {
    clock = START + RIGHTS_MAX_AGE;
    expect(await evaluate(bare())).toEqual({ action: 'pass' });

    clock = START + RIGHTS_MAX_AGE + 1;
    expect(await evaluate(bare())).toEqual({
      action: 'redirect',
      location: '/auth/sign-in?returnTo=%2Fconsole%2Fplayers',
    });
    expect(refreshCalls).toEqual([]);
  });

  it('refuse une écriture une fois les droits trop anciens', async () => {
    clock = START + RIGHTS_MAX_AGE + 1;
    expect(await evaluate(bare(), { method: 'POST' })).toMatchObject({
      action: 'redirect',
      location: '/sign-in?returnTo=%2Fconsole%2Fplayers&error=session_ended',
    });
  });
});

describe('session de développement', () => {
  const dev = () => {
    const payload = session({
      sub: 'dev:local',
      dev: true,
      expiresAt: START + SESSION_ABSOLUTE_TTL,
    });
    delete payload.refreshToken;
    return payload;
  };

  it('est refusée et effacée quand le mode développement est fermé', async () => {
    expect(await evaluate(dev())).toEqual({
      action: 'redirect',
      location: '/sign-in?returnTo=%2Fconsole%2Fplayers',
      clearSession: true,
    });
  });

  it('passe sans appel au fournisseur quand le mode est ouvert', async () => {
    clock = START + 3 * 3600;
    const decision = await evaluate(
      dev(),
      {},
      { config: { ...CONFIG, production: false, devAuth: true } },
    );
    expect(decision).toEqual({ action: 'pass' });
    expect(refreshCalls).toEqual([]);
  });
});

describe('requêtes simultanées', () => {
  it('ne présente qu’une fois le même jeton au fournisseur', async () => {
    clock = START + RIGHTS_REFRESH_AFTER + 1;
    let release: ((outcome: RefreshOutcome) => void) | null = null;
    nextOutcome = () =>
      new Promise<RefreshOutcome>((resolve) => {
        release = resolve;
      });

    const payload = session();
    const pending = [evaluate(payload), evaluate(payload), evaluate(payload)];
    // On attend que le fournisseur ait réellement été appelé, et non un délai
    // fixe : sur une machine chargée, 20 ms ne suffisaient pas toujours.
    await vi.waitFor(() => expect(release).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 20));
    release!({ kind: 'renewed', grant: grant() });
    const decisions = await Promise.all(pending);

    expect(refreshCalls).toEqual(['asc_rt_initial']);
    for (const decision of decisions) {
      expect(decision.session?.refreshToken).toBe('asc_rt_after_1');
    }
  });

  it('sert le résultat à une requête partie avec l’ancien cookie, sans rejouer le jeton', async () => {
    clock = START + RIGHTS_REFRESH_AFTER + 1;
    const payload = session();
    await evaluate(payload);

    clock += 30;
    const late = await evaluate(payload);
    expect(refreshCalls).toEqual(['asc_rt_initial']);
    expect(late.session?.refreshToken).toBe('asc_rt_after_1');
  });

  it('retente après une indisponibilité : le jeton n’a pas été consommé', async () => {
    clock = START + RIGHTS_REFRESH_AFTER + 1;
    nextOutcome = () => ({ kind: 'unavailable' });
    const payload = session();
    await evaluate(payload);

    nextOutcome = () => ({ kind: 'renewed', grant: grant() });
    const retry = await evaluate(payload);
    expect(refreshCalls).toEqual(['asc_rt_initial', 'asc_rt_initial']);
    expect(retry.session?.checkedAt).toBe(clock);
  });
});
