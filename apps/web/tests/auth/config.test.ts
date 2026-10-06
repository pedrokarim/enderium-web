import { describe, expect, it } from 'vitest';
import { AuthConfigError, parseAuthConfig } from '../../src/server/auth/config';

const SESSION_SECRET = 'k3Jx9Qm2Vt7Lp0Zr5Ny8Hb4Wd1Fs6Gc3Ua9Ei2Ox7Tq';
const CLIENT_SECRET = 'asc_cs_valeur_tres_secrete_a_ne_jamais_afficher';

const PRODUCTION = {
  NODE_ENV: 'production',
  APP_URL: 'https://enderium.ascencia.re',
  SESSION_SECRET,
  ASCENCIA_ISSUER: 'https://id.ascencia.re',
  ASCENCIA_CLIENT_ID: 'asc_cid_enderium',
  ASCENCIA_CLIENT_SECRET: CLIENT_SECRET,
  ASCENCIA_REDIRECT_URI: 'https://enderium.ascencia.re/auth/callback',
  ENDERIUM_DEV_AUTH: '0',
};

const DEVELOPMENT = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:3100',
  SESSION_SECRET,
  ASCENCIA_ISSUER: 'https://id.ascencia.re',
  ASCENCIA_CLIENT_ID: '',
  ASCENCIA_CLIENT_SECRET: '',
  ASCENCIA_REDIRECT_URI: 'http://localhost:3100/auth/callback',
  ENDERIUM_DEV_AUTH: '1',
};

function problemsOf(environment: Record<string, string | undefined>): string[] {
  try {
    parseAuthConfig(environment);
  } catch (error) {
    expect(error).toBeInstanceOf(AuthConfigError);
    return [...(error as AuthConfigError).problems];
  }
  throw new Error('La configuration aurait dû être refusée.');
}

describe('configuration valide', () => {
  it('accepte la production complète, cookies sécurisés et mode développement fermé', () => {
    expect(parseAuthConfig(PRODUCTION)).toEqual({
      production: true,
      appOrigin: 'https://enderium.ascencia.re',
      sessionSecret: SESSION_SECRET,
      ascencia: {
        issuer: 'https://id.ascencia.re',
        clientId: 'asc_cid_enderium',
        clientSecret: CLIENT_SECRET,
        redirectUri: 'https://enderium.ascencia.re/auth/callback',
      },
      devAuth: false,
      secureCookies: true,
    });
  });

  it('démarre en développement sans client Ascencia ID, connexion locale ouverte', () => {
    const config = parseAuthConfig(DEVELOPMENT);
    expect(config.ascencia).toBeNull();
    expect(config.devAuth).toBe(true);
    expect(config.secureCookies).toBe(false);
  });

  it('retire la barre finale de l’émetteur', () => {
    const config = parseAuthConfig({ ...PRODUCTION, ASCENCIA_ISSUER: 'https://id.ascencia.re/' });
    expect(config.ascencia?.issuer).toBe('https://id.ascencia.re');
  });
});

describe('mode développement en production', () => {
  it('refuse ENDERIUM_DEV_AUTH=1 dès que NODE_ENV=production', () => {
    const problems = problemsOf({ ...PRODUCTION, ENDERIUM_DEV_AUTH: '1' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('ENDERIUM_DEV_AUTH=1 est interdit en production');
  });

  it('le refuse aussi quand le reste de la configuration est incomplet', () => {
    const problems = problemsOf({ NODE_ENV: 'production', ENDERIUM_DEV_AUTH: '1' });
    expect(problems.some((problem) => problem.includes('ENDERIUM_DEV_AUTH=1 est interdit'))).toBe(
      true,
    );
  });

  it('n’ouvre jamais la connexion locale en production, quelle que soit la valeur', () => {
    for (const value of ['0', undefined, '']) {
      expect(parseAuthConfig({ ...PRODUCTION, ENDERIUM_DEV_AUTH: value }).devAuth).toBe(false);
    }
    for (const value of ['true', 'yes', '2', ' 1 x']) {
      expect(() => parseAuthConfig({ ...PRODUCTION, ENDERIUM_DEV_AUTH: value })).toThrow(
        AuthConfigError,
      );
    }
  });

  it('ne l’ouvre hors production que sur la valeur exacte 1', () => {
    expect(parseAuthConfig({ ...DEVELOPMENT, ENDERIUM_DEV_AUTH: '1' }).devAuth).toBe(true);
    expect(parseAuthConfig({ ...DEVELOPMENT, ENDERIUM_DEV_AUTH: '0' }).devAuth).toBe(false);
    expect(parseAuthConfig({ ...DEVELOPMENT, ENDERIUM_DEV_AUTH: undefined }).devAuth).toBe(false);
  });
});

describe('configuration refusée', () => {
  it('exige les quatre variables Ascencia ID en production', () => {
    const problems = problemsOf({
      ...PRODUCTION,
      ASCENCIA_CLIENT_ID: undefined,
      ASCENCIA_CLIENT_SECRET: '   ',
    });
    expect(problems).toContain('ASCENCIA_CLIENT_ID est obligatoire.');
    expect(problems).toContain('ASCENCIA_CLIENT_SECRET est obligatoire.');
  });

  it('exige un secret de session, long et aléatoire', () => {
    expect(problemsOf({ ...PRODUCTION, SESSION_SECRET: undefined })[0]).toContain(
      'SESSION_SECRET est obligatoire',
    );
    expect(problemsOf({ ...PRODUCTION, SESSION_SECRET: 'trop-court' })[0]).toContain(
      'au moins 32 octets',
    );
    expect(problemsOf({ ...PRODUCTION, SESSION_SECRET: 'a'.repeat(64) })[0]).toContain(
      'doit être aléatoire',
    );
  });

  it('refuse http hors de la machine locale', () => {
    expect(problemsOf({ ...PRODUCTION, APP_URL: 'http://enderium.ascencia.re' })[0]).toContain(
      'APP_URL doit être en https',
    );
    expect(
      problemsOf({ ...PRODUCTION, ASCENCIA_ISSUER: 'http://id.ascencia.re' }).join('\n'),
    ).toContain('ASCENCIA_ISSUER doit être en https');
  });

  it('refuse une URI de retour qui ne pointe pas sur le site', () => {
    expect(
      problemsOf({
        ...PRODUCTION,
        ASCENCIA_REDIRECT_URI: 'https://ailleurs.example/auth/callback',
      }),
    ).toEqual(['ASCENCIA_REDIRECT_URI doit valoir exactement APP_URL + /auth/callback.']);
  });

  it('refuse une URL publique avec un chemin', () => {
    expect(problemsOf({ ...PRODUCTION, APP_URL: 'https://ascencia.re/enderium' })[0]).toContain(
      'APP_URL est une origine seule',
    );
  });

  it('ne cite jamais la valeur d’un secret dans un message', () => {
    const leaky = 'm0t-de-passe-colle-par-erreur';
    const cases: Record<string, string | undefined>[] = [
      { ...PRODUCTION, SESSION_SECRET: leaky },
      { ...PRODUCTION, ASCENCIA_CLIENT_SECRET: CLIENT_SECRET, ENDERIUM_DEV_AUTH: '1' },
      { ...PRODUCTION, ASCENCIA_REDIRECT_URI: `https://${leaky}.example/cb` },
      { ...PRODUCTION, APP_URL: `https://user:${leaky}@enderium.ascencia.re` },
      { ...PRODUCTION, ASCENCIA_ISSUER: leaky },
      { ...PRODUCTION, ENDERIUM_DEV_AUTH: leaky },
    ];

    for (const environment of cases) {
      let message = '';
      try {
        parseAuthConfig(environment);
      } catch (error) {
        message = (error as Error).message + JSON.stringify(error);
      }
      expect(message).not.toBe('');
      expect(message).not.toContain(leaky);
      expect(message).not.toContain(CLIENT_SECRET);
      expect(message).not.toContain(SESSION_SECRET);
    }
  });
});
