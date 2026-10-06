/**
 * Gardes côté serveur : à appeler dans les composants serveur, les actions
 * serveur et les route handlers. C'est ici que se fait le **vrai** contrôle
 * d'accès ; le proxy n'est qu'une première barrière.
 *
 * ```ts
 * const user = await requirePermission('economy.write');
 * ```
 */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getAuthConfig } from './config';
import { cookieNames } from './cookies';
import type { ConsolePermission } from './permissions';
import { REQUEST_PATH_HEADER } from './request-headers';
import { DEFAULT_RETURN_TO, sanitizeReturnTo } from './return-to';
import { AUTH_ROUTES } from './routes';
import {
  type ConsoleUser,
  nowInSeconds,
  openSession,
  sessionStanding,
  toConsoleUser,
} from './session';

/**
 * La personne connectée, ou `null`.
 *
 * Mémoïsé par requête : dix composants qui l'appellent pendant le même rendu
 * ne déchiffrent le cookie qu'une fois.
 *
 * Une session dont les droits n'ont pas été confirmés par Ascencia ID depuis
 * plus de quinze minutes est refusée ici, même si le cookie est encore
 * valide : c'est ce qui borne la durée pendant laquelle un rôle retiré
 * continue de compter, y compris si le proxy n'a pas pu les renouveler.
 */
export const getSession = cache(async (): Promise<ConsoleUser | null> => {
  const config = getAuthConfig();
  const store = await cookies();
  const now = nowInSeconds();

  const session = await openSession(
    store.get(cookieNames(config).session)?.value,
    config.sessionSecret,
    now,
  );
  if (!session) return null;

  const standing = sessionStanding(session, { now, devAuth: config.devAuth });
  if (standing === 'stale' || standing === 'rejected') return null;

  return toConsoleUser(session);
});

/** Le chemin de la requête en cours, tel que le proxy l'a noté. */
async function currentPath(): Promise<string> {
  const store = await headers();
  return sanitizeReturnTo(store.get(REQUEST_PATH_HEADER), DEFAULT_RETURN_TO);
}

/** La personne connectée. Sans session : redirection vers `/sign-in?returnTo=…`. */
export async function requireUser(): Promise<ConsoleUser> {
  const user = await getSession();
  if (user) return user;

  const returnTo = await currentPath();
  redirect(`${AUTH_ROUTES.signInPage}?returnTo=${encodeURIComponent(returnTo)}`);
}

/**
 * La personne connectée, si elle détient la permission. Connectée sans le
 * droit : redirection vers `/denied`.
 */
export async function requirePermission(permission: ConsolePermission): Promise<ConsoleUser> {
  const user = await requireUser();
  if (can(user, permission)) return user;

  redirect(`${AUTH_ROUTES.deniedPage}?permission=${encodeURIComponent(permission)}`);
}

/** Pour l'affichage (masquer un bouton). Ce n'est **pas** un contrôle : voir `requirePermission`. */
export function can(user: ConsoleUser, permission: ConsolePermission): boolean {
  return user.permissions.has(permission);
}
