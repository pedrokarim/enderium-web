import { handleSignIn } from '@/server/auth/handlers';

/** Départ vers Ascencia ID. Jamais mis en cache : chaque appel tire un `state` neuf. */
export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return handleSignIn(request);
}
