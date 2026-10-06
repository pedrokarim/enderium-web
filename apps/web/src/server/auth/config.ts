/**
 * Configuration de l'authentification, lue dans l'environnement et validée au
 * premier usage.
 *
 * Règle de ce fichier : un message d'erreur nomme la variable et dit ce qui
 * est attendu, il ne cite **jamais** la valeur reçue. Un secret mal collé ne
 * doit pas finir dans un journal.
 */

import { z } from 'zod';

export const SESSION_SECRET_MIN_LENGTH = 32;
export const CALLBACK_PATH = '/auth/callback';

export interface AscenciaSettings {
  /** Racine du fournisseur, sans barre finale. */
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export interface AuthConfig {
  readonly production: boolean;
  /** Origine publique du site (`https://enderium.ascencia.re`), sans chemin. */
  readonly appOrigin: string;
  readonly sessionSecret: string;
  /** `null` tant que les quatre variables `ASCENCIA_*` ne sont pas renseignées (hors production). */
  readonly ascencia: AscenciaSettings | null;
  /** Connexion locale de développement. Toujours `false` en production. */
  readonly devAuth: boolean;
  /** Cookies `Secure` et préfixe `__Host-`. */
  readonly secureCookies: boolean;
}

/** Erreur de configuration : la liste des problèmes, sans aucune valeur. */
export class AuthConfigError extends Error {
  override readonly name = 'AuthConfigError';
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Configuration d’authentification invalide :\n${problems.map((problem) => `  – ${problem}`).join('\n')}`,
    );
    this.problems = problems;
  }
}

/** Une variable vide ou faite d'espaces vaut « absente ». */
const optionalText = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const environmentSchema = z.object({
  NODE_ENV: optionalText,
  APP_URL: optionalText,
  SESSION_SECRET: optionalText,
  ASCENCIA_ISSUER: optionalText,
  ASCENCIA_CLIENT_ID: optionalText,
  ASCENCIA_CLIENT_SECRET: optionalText,
  ASCENCIA_REDIRECT_URI: optionalText,
  ENDERIUM_DEV_AUTH: optionalText,
});

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname) || url.hostname.endsWith('.localhost');
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Une URL de service : `https`, ou `http` sur la machine locale seulement.
 * Renvoie le problème à signaler, ou `null`.
 */
function checkServiceUrl(name: string, url: URL | null): string | null {
  if (!url) return `${name} doit être une URL absolue (https://…).`;
  if (url.username || url.password) return `${name} ne doit pas contenir d’identifiants.`;
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && isLoopback(url)) return null;
  return `${name} doit être en https (http n’est accepté que sur localhost).`;
}

/** Fonction pure : c'est elle que les tests appellent. */
export function parseAuthConfig(environment: Record<string, string | undefined>): AuthConfig {
  const env = environmentSchema.parse({
    NODE_ENV: environment.NODE_ENV,
    APP_URL: environment.APP_URL,
    SESSION_SECRET: environment.SESSION_SECRET,
    ASCENCIA_ISSUER: environment.ASCENCIA_ISSUER,
    ASCENCIA_CLIENT_ID: environment.ASCENCIA_CLIENT_ID,
    ASCENCIA_CLIENT_SECRET: environment.ASCENCIA_CLIENT_SECRET,
    ASCENCIA_REDIRECT_URI: environment.ASCENCIA_REDIRECT_URI,
    ENDERIUM_DEV_AUTH: environment.ENDERIUM_DEV_AUTH,
  });

  const production = env.NODE_ENV === 'production';
  const problems: string[] = [];

  // ── Mode développement ─────────────────────────────────────────────────────
  const devAuthRequested = env.ENDERIUM_DEV_AUTH === '1';
  if (env.ENDERIUM_DEV_AUTH !== undefined && !['0', '1'].includes(env.ENDERIUM_DEV_AUTH)) {
    problems.push('ENDERIUM_DEV_AUTH vaut 0 ou 1.');
  }
  if (production && devAuthRequested) {
    problems.push(
      'ENDERIUM_DEV_AUTH=1 est interdit en production : la connexion locale ouvrirait la console sans Ascencia ID. Retirer la variable ou la mettre à 0.',
    );
  }

  // ── Site ───────────────────────────────────────────────────────────────────
  let appOrigin = '';
  if (!env.APP_URL) {
    problems.push('APP_URL est obligatoire (URL publique du site).');
  } else {
    const url = parseUrl(env.APP_URL);
    const problem = checkServiceUrl('APP_URL', url);
    if (problem) problems.push(problem);
    else if (url) {
      if (url.pathname !== '/' || url.search || url.hash) {
        problems.push('APP_URL est une origine seule, sans chemin ni paramètres.');
      }
      appOrigin = url.origin;
    }
  }

  if (!env.SESSION_SECRET) {
    problems.push('SESSION_SECRET est obligatoire (générer : openssl rand -base64 48).');
  } else if (new TextEncoder().encode(env.SESSION_SECRET).length < SESSION_SECRET_MIN_LENGTH) {
    problems.push(`SESSION_SECRET doit faire au moins ${SESSION_SECRET_MIN_LENGTH} octets.`);
  } else if (new Set(env.SESSION_SECRET).size < 8) {
    problems.push('SESSION_SECRET doit être aléatoire (générer : openssl rand -base64 48).');
  }

  // ── Ascencia ID ────────────────────────────────────────────────────────────
  const ascenciaNames = [
    'ASCENCIA_ISSUER',
    'ASCENCIA_CLIENT_ID',
    'ASCENCIA_CLIENT_SECRET',
    'ASCENCIA_REDIRECT_URI',
  ] as const;
  const missing = ascenciaNames.filter((name) => env[name] === undefined);

  // Hors production, le site démarre sans Ascencia ID tant que le client
  // n'est pas créé : seul l'émetteur est pré-rempli dans `.env.example`.
  const ascenciaExpected =
    production || (env.ASCENCIA_CLIENT_ID ?? env.ASCENCIA_CLIENT_SECRET) !== undefined;

  let ascencia: AscenciaSettings | null = null;
  if (ascenciaExpected && missing.length > 0) {
    for (const name of missing) problems.push(`${name} est obligatoire.`);
  } else if (missing.length === 0) {
    const issuerUrl = parseUrl(env.ASCENCIA_ISSUER as string);
    const redirectUrl = parseUrl(env.ASCENCIA_REDIRECT_URI as string);

    const issuerProblem = checkServiceUrl('ASCENCIA_ISSUER', issuerUrl);
    if (issuerProblem) problems.push(issuerProblem);
    else if (issuerUrl && (issuerUrl.search || issuerUrl.hash)) {
      problems.push('ASCENCIA_ISSUER est l’adresse du fournisseur, sans paramètres.');
    }

    const redirectProblem = checkServiceUrl('ASCENCIA_REDIRECT_URI', redirectUrl);
    if (redirectProblem) problems.push(redirectProblem);
    else if (appOrigin && redirectUrl?.href !== `${appOrigin}${CALLBACK_PATH}`) {
      // Une URI de retour ailleurs que sur le site ferait partir le code
      // d'autorisation vers une page qui ne sait pas le consommer.
      problems.push(`ASCENCIA_REDIRECT_URI doit valoir exactement APP_URL + ${CALLBACK_PATH}.`);
    }

    if (!issuerProblem && !redirectProblem && issuerUrl && redirectUrl) {
      ascencia = {
        issuer: issuerUrl.href.replace(/\/+$/, ''),
        clientId: env.ASCENCIA_CLIENT_ID as string,
        clientSecret: env.ASCENCIA_CLIENT_SECRET as string,
        redirectUri: redirectUrl.href,
      };
    }
  }

  if (problems.length > 0) throw new AuthConfigError(problems);

  return {
    production,
    appOrigin,
    sessionSecret: env.SESSION_SECRET as string,
    ascencia,
    devAuth: devAuthRequested && !production,
    secureCookies: production || appOrigin.startsWith('https://'),
  };
}

type Loaded = { ok: true; config: AuthConfig } | { ok: false; error: AuthConfigError };

let loaded: Loaded | null = null;

/**
 * Configuration du processus, validée une fois. L'environnement ne change pas
 * en cours de route : une erreur est retenue elle aussi, et relancée telle
 * quelle à chaque appel.
 */
export function getAuthConfig(): AuthConfig {
  if (!loaded) {
    try {
      loaded = { ok: true, config: parseAuthConfig(process.env) };
    } catch (cause) {
      if (!(cause instanceof AuthConfigError)) throw cause;
      loaded = { ok: false, error: cause };
    }
  }
  if (!loaded.ok) throw loaded.error;
  return loaded.config;
}

/** Réservé aux tests : oublie la configuration retenue. */
export function resetAuthConfigForTests(): void {
  loaded = null;
}
