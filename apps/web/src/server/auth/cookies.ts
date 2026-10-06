/**
 * Les deux cookies de l'authentification : la session, et la transaction de
 * connexion (courte, le temps de l'aller-retour chez Ascencia ID).
 *
 * En production, les noms portent le préfixe `__Host-` : le navigateur refuse
 * alors tout cookie de ce nom qui ne serait pas `Secure`, sur `Path=/` et sans
 * attribut `Domain`. Un sous-domaine voisin ne peut donc pas en déposer un à
 * la place du site.
 */

import type { AuthConfig } from './config';

export interface CookieNames {
  readonly session: string;
  readonly transaction: string;
}

export function cookieNames(config: Pick<AuthConfig, 'secureCookies'>): CookieNames {
  const prefix = config.secureCookies ? '__Host-' : '';
  return {
    session: `${prefix}enderium_session`,
    transaction: `${prefix}enderium_sign_in`,
  };
}

/**
 * Attributs communs. `SameSite=Lax` et pas `Strict` : avec `Strict`, le cookie
 * de transaction ne reviendrait pas au retour d'Ascencia ID (navigation venue
 * d'un autre site) et la connexion échouerait toujours.
 */
export function cookieAttributes(config: Pick<AuthConfig, 'secureCookies'>, maxAge: number) {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.max(0, Math.floor(maxAge)),
  };
}

/** En-tête `Set-Cookie`. Les valeurs sont des JWE compacts : rien à échapper. */
export function serializeCookie(
  config: Pick<AuthConfig, 'secureCookies'>,
  name: string,
  value: string,
  maxAge: number,
): string {
  const attributes = cookieAttributes(config, maxAge);
  const parts = [`${name}=${value}`, 'Path=/', `Max-Age=${attributes.maxAge}`, 'HttpOnly'];
  if (attributes.secure) parts.push('Secure');
  parts.push('SameSite=Lax');
  return parts.join('; ');
}

export function expireCookie(config: Pick<AuthConfig, 'secureCookies'>, name: string): string {
  return serializeCookie(config, name, '', 0);
}

/** Lit un cookie dans l'en-tête `Cookie` d'une requête. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}
