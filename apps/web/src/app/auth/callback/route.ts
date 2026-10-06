import { handleCallback } from '@/server/auth/handlers';

/** Retour d'Ascencia ID : c'est l'URI de redirection enregistrée chez le fournisseur. */
export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return handleCallback(request);
}
