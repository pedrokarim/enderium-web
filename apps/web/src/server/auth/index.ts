/**
 * Authentification et contrôle d'accès de la console.
 *
 * Côté serveur seulement : ce module lit les cookies de la requête et les
 * secrets de l'environnement. Voir `docs/auth.md`.
 */

export { can, getSession, requirePermission, requireUser } from './guards';
export type { ConsoleUser } from './session';
export {
  CONSOLE_PERMISSIONS,
  type ConsolePermission,
  type DevProfileId,
  isConsolePermission,
} from './permissions';
export { SIGN_OUT_ACTION, type SignInOptions, getSignInOptions } from './sign-in-options';
export { AUTH_ROUTES } from './routes';
export { type SignInErrorCode, describeSignInError } from './errors';
