/**
 * Proxy de Next 16 (l'ancien `middleware`). Il s'exécute avant chaque page,
 * sous Node.js, et fait trois choses :
 *
 *   1. première barrière de `/console/**` et `/studio/**` : sans session, on
 *      part vers la connexion. Ce n'est qu'une défense en profondeur – le vrai
 *      contrôle est dans les gardes (`requireUser`, `requirePermission`) ;
 *   2. redemande les droits à Ascencia ID quand ils datent, et réécrit le
 *      cookie de session ;
 *   3. pose la politique de sécurité du contenu, avec un nonce par requête.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { AuthConfigError } from '@/server/auth/config';
import { cookieAttributes, cookieNames } from '@/server/auth/cookies';
import { buildContentSecurityPolicy, createNonce, originOf } from '@/server/auth/csp';
import { type GateDecision, evaluateRequest } from '@/server/auth/gate';
import { REQUEST_PATH_HEADER } from '@/server/auth/request-headers';
import { type SessionRefresher, createSessionRefresher } from '@/server/auth/refresher';
import { isProtectedPath } from '@/server/auth/routes';
import { type AuthRuntime, getAuthRuntime } from '@/server/auth/runtime';
import { sealSession } from '@/server/auth/session';

const NONCE_HEADER = 'x-nonce';
const CSP_HEADER = 'content-security-policy';

let refresher: SessionRefresher | null = null;

function getRefresher(runtime: AuthRuntime): SessionRefresher {
  if (!refresher) {
    const flow = runtime.flow;
    refresher = flow
      ? createSessionRefresher({ flow, now: runtime.now })
      : async () => ({ kind: 'unavailable' });
  }
  return refresher;
}

function plainResponse(status: number, message: string): NextResponse {
  return new NextResponse(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  // Les routes d'authentification gèrent elles-mêmes leurs cookies.
  if (pathname.startsWith('/auth/')) return NextResponse.next();

  let runtime: AuthRuntime;
  try {
    runtime = getAuthRuntime();
  } catch (cause) {
    if (!(cause instanceof AuthConfigError)) throw cause;
    console.error(cause.message);
    // Environnement invalide : les espaces protégés sont fermés, pas ouverts.
    return isProtectedPath(pathname)
      ? plainResponse(503, 'Le site est mal configuré : l’authentification est indisponible.')
      : NextResponse.next();
  }

  const authConfig = runtime.config;
  const names = cookieNames(authConfig);

  const decision: GateDecision = await evaluateRequest(
    {
      method: request.method,
      pathname,
      search,
      sessionCookie: request.cookies.get(names.session)?.value ?? null,
    },
    runtime,
    getRefresher(runtime),
  );

  // ── Cookie de session : le rendu doit voir la même chose que le navigateur ──
  let sealed: string | null = null;
  if (decision.session) {
    sealed = await sealSession(decision.session, authConfig.sessionSecret);
    request.cookies.set(names.session, sealed);
  } else if (decision.clearSession) {
    request.cookies.delete(names.session);
  }

  let response: NextResponse;
  if (decision.action === 'redirect') {
    // 303 pour tout ce qui n'est pas une lecture : la suite est un GET.
    const status = request.method === 'GET' || request.method === 'HEAD' ? 307 : 303;
    response = NextResponse.redirect(new URL(decision.location, authConfig.appOrigin), status);
    response.headers.set('cache-control', 'no-store');
  } else if (decision.action === 'unavailable') {
    response = plainResponse(503, decision.message);
  } else {
    const nonce = createNonce();
    const policy = buildContentSecurityPolicy({
      nonce,
      development: process.env.NODE_ENV === 'development',
      issuerOrigin: originOf(authConfig.ascencia?.issuer),
      upgradeInsecureRequests: authConfig.appOrigin.startsWith('https://'),
    });

    const forwarded = new Headers(request.headers);
    // Ces en-têtes sont écrits ici et nulle part ailleurs : ce qu'un client
    // aurait envoyé sous le même nom est écrasé.
    forwarded.set(REQUEST_PATH_HEADER, `${pathname}${search}`);
    forwarded.set(NONCE_HEADER, nonce);
    // Next lit le nonce dans cet en-tête de requête pour le poser sur ses scripts.
    forwarded.set(CSP_HEADER, policy);

    response = NextResponse.next({ request: { headers: forwarded } });
    response.headers.set(CSP_HEADER, policy);
  }

  if (sealed && decision.session) {
    const now = runtime.now();
    response.cookies.set(
      names.session,
      sealed,
      cookieAttributes(authConfig, decision.session.expiresAt - now),
    );
  } else if (decision.clearSession) {
    response.cookies.set(names.session, '', cookieAttributes(authConfig, 0));
  }

  return response;
}

export const config = {
  // Tout, sauf les fichiers statiques de Next. Les gardes font le reste.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
