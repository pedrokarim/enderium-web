import { handleDevSignIn } from '@/server/auth/handlers';

/** Connexion locale de développement. Répond 404 en production. */
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return handleDevSignIn(request);
}
