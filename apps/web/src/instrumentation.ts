/**
 * Exécuté une fois au démarrage du serveur.
 *
 * En production, une configuration d'authentification invalide arrête le
 * démarrage au lieu d'attendre la première requête : un site qui démarre avec
 * `ENDERIUM_DEV_AUTH=1` ou sans secret de session ne doit pas démarrer du tout.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;

  const { getAuthConfig } = await import('@/server/auth/config');
  getAuthConfig();
}
