import { handleSignOut } from '@/server/auth/handlers';

/**
 * Déconnexion. POST seulement : une déconnexion en GET se déclenche d'un
 * simple lien ou d'une image posée sur n'importe quel site.
 */
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return handleSignOut(request);
}
