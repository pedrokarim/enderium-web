/**
 * Les quatre routes de l'authentification, écrites sur `Request` / `Response`
 * seuls : aucune dépendance à Next, donc testables telles quelles. Les
 * fichiers `app/auth/…/route.ts` ne font que les brancher.
 *
 *   GET  /auth/sign-in       départ vers Ascencia ID
 *   GET  /auth/callback      retour d'Ascencia ID, ouverture de la session
 *   POST /auth/sign-out      fin de la session
 *   POST /auth/dev-sign-in   connexion locale (développement seulement)
 */

import { AuthConfigError, type AuthConfig } from './config';
import { cookieNames, expireCookie, readCookie, serializeCookie } from './cookies';
import { crossOriginRefusal, isSameOriginRequest } from './csrf';
import { SignInError, type SignInErrorCode } from './errors';
import { startDevSession, startSession } from './lifecycle';
import { isDevProfileId } from './permissions';
import { DEFAULT_RETURN_TO, sanitizeReturnTo } from './return-to';
import { AUTH_ROUTES } from './routes';
import { type AuthRuntime, getAuthRuntime } from './runtime';
import {
  TRANSACTION_TTL,
  type SessionPayload,
  openSession,
  openTransaction,
  sealSession,
  sealTransaction,
} from './session';

const ALLOWED_PROMPTS = ['none', 'login', 'select_account'] as const;

// ── Réponses ─────────────────────────────────────────────────────────────────

/**
 * Redirection. Rien de ce parcours ne doit rester dans un cache, et l'adresse
 * de retour (qui porte le code d'autorisation) ne doit pas partir en `Referer`.
 */
function redirect(location: string, cookies: string[] = [], status: 302 | 303 = 303): Response {
  const headers = new Headers({
    location,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status, headers });
}

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function misconfigured(error: AuthConfigError): Response {
  // La liste des problèmes va dans le journal du serveur (elle ne contient
  // aucune valeur) ; la personne en face n'a pas à la lire.
  console.error(error.message);
  return new Response('Le site est mal configuré : l’authentification est indisponible.', {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function loadRuntime(provided?: AuthRuntime): AuthRuntime | AuthConfigError {
  if (provided) return provided;
  try {
    return getAuthRuntime();
  } catch (cause) {
    if (cause instanceof AuthConfigError) return cause;
    throw cause;
  }
}

/** Adresse de la page de connexion, avec le motif d'échec et la destination. */
function signInPageUrl(
  config: AuthConfig,
  query: { error?: SignInErrorCode; returnTo?: string; signedOut?: boolean } = {},
): string {
  const url = new URL(AUTH_ROUTES.signInPage, config.appOrigin);
  if (query.error) url.searchParams.set('error', query.error);
  if (query.signedOut) url.searchParams.set('signedOut', '1');
  if (query.returnTo && query.returnTo !== DEFAULT_RETURN_TO) {
    url.searchParams.set('returnTo', query.returnTo);
  }
  return url.toString();
}

function toErrorCode(cause: unknown): SignInErrorCode {
  if (cause instanceof SignInError) return cause.code;
  // Inattendu : on le garde pour le journal, sans rien en dire au navigateur.
  console.error('Échec inattendu du parcours de connexion.', cause);
  return 'exchange_failed';
}

async function sessionCookie(
  runtime: AuthRuntime,
  session: SessionPayload,
  now: number,
): Promise<string> {
  const sealed = await sealSession(session, runtime.config.sessionSecret);
  return serializeCookie(
    runtime.config,
    cookieNames(runtime.config).session,
    sealed,
    session.expiresAt - now,
  );
}

// ── GET /auth/sign-in ────────────────────────────────────────────────────────

export async function handleSignIn(request: Request, provided?: AuthRuntime): Promise<Response> {
  const runtime = loadRuntime(provided);
  if (runtime instanceof AuthConfigError) return misconfigured(runtime);
  const { config, flow } = runtime;

  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo'));
  if (!flow) return redirect(signInPageUrl(config, { error: 'not_configured', returnTo }));

  const requestedPrompt = url.searchParams.get('prompt');
  const prompt = ALLOWED_PROMPTS.find((allowed) => allowed === requestedPrompt);

  try {
    const { authorizeUrl, transaction } = await flow.beginSignIn({
      returnTo,
      ...(prompt ? { prompt } : {}),
    });
    const sealed = await sealTransaction(transaction, config.sessionSecret);
    return redirect(
      authorizeUrl,
      [serializeCookie(config, cookieNames(config).transaction, sealed, TRANSACTION_TTL)],
      302,
    );
  } catch (cause) {
    return redirect(signInPageUrl(config, { error: toErrorCode(cause), returnTo }));
  }
}

// ── GET /auth/callback ───────────────────────────────────────────────────────

export async function handleCallback(request: Request, provided?: AuthRuntime): Promise<Response> {
  const runtime = loadRuntime(provided);
  if (runtime instanceof AuthConfigError) return misconfigured(runtime);
  const { config, flow } = runtime;
  const names = cookieNames(config);

  // La transaction ne sert qu'une fois : elle est effacée quelle que soit l'issue.
  const clearTransaction = expireCookie(config, names.transaction);
  if (!flow)
    return redirect(signInPageUrl(config, { error: 'not_configured' }), [clearTransaction]);

  const now = runtime.now();
  const transaction = await openTransaction(
    readCookie(request, names.transaction),
    config.sessionSecret,
    now,
  );
  if (!transaction) {
    return redirect(signInPageUrl(config, { error: 'invalid_state' }), [clearTransaction]);
  }

  const returnTo = sanitizeReturnTo(transaction.returnTo);
  try {
    const grant = await flow.completeSignIn(new URL(request.url).searchParams, transaction);
    const session = startSession(grant, now);
    return redirect(new URL(returnTo, config.appOrigin).toString(), [
      await sessionCookie(runtime, session, now),
      clearTransaction,
    ]);
  } catch (cause) {
    return redirect(signInPageUrl(config, { error: toErrorCode(cause), returnTo }), [
      clearTransaction,
    ]);
  }
}

// ── POST /auth/sign-out ──────────────────────────────────────────────────────

export async function handleSignOut(request: Request, provided?: AuthRuntime): Promise<Response> {
  const runtime = loadRuntime(provided);
  if (runtime instanceof AuthConfigError) return misconfigured(runtime);
  const { config, flow } = runtime;

  if (!isSameOriginRequest(request, config.appOrigin)) return crossOriginRefusal();

  const names = cookieNames(config);
  const clearSession = expireCookie(config, names.session);
  const session = await openSession(
    readCookie(request, names.session),
    config.sessionSecret,
    runtime.now(),
  );

  // Le jeton de renouvellement est révoqué chez le fournisseur : le cookie
  // effacé ici ne suffirait pas si quelqu'un en avait gardé une copie.
  if (flow && session?.refreshToken) await flow.revoke(session.refreshToken);

  const form = await readForm(request);
  const everywhere = form?.get('global') === '1';
  if (flow && everywhere && session && !session.dev) {
    // Déconnexion d'Ascencia ID lui-même (toutes les applications de la zone).
    const target = await flow.endSessionUrl({
      idToken: session.idToken ?? null,
      postLogoutRedirectUri: signInPageUrl(config),
    });
    return redirect(target, [clearSession]);
  }

  return redirect(signInPageUrl(config, { signedOut: true }), [clearSession]);
}

// ── POST /auth/dev-sign-in ───────────────────────────────────────────────────

export async function handleDevSignIn(request: Request, provided?: AuthRuntime): Promise<Response> {
  // Premier contrôle, indépendant de tout le reste : en production cette
  // route n'existe pas, même si la configuration était lue de travers.
  if (process.env.NODE_ENV === 'production') return notFound();

  const runtime = loadRuntime(provided);
  if (runtime instanceof AuthConfigError) return notFound();
  const { config } = runtime;
  if (config.production || !config.devAuth) return notFound();

  if (!isSameOriginRequest(request, config.appOrigin)) return crossOriginRefusal();

  const form = await readForm(request);
  const requestedProfile = form?.get('profile') ?? 'full';
  if (!isDevProfileId(requestedProfile)) {
    return new Response('Profil de développement inconnu.', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const now = runtime.now();
  const session = startDevSession(requestedProfile, now);
  const returnTo = sanitizeReturnTo(form?.get('returnTo'));
  return redirect(new URL(returnTo, config.appOrigin).toString(), [
    await sessionCookie(runtime, session, now),
  ]);
}

async function readForm(request: Request): Promise<FormData | null> {
  const type = request.headers.get('content-type') ?? '';
  if (
    !type.startsWith('application/x-www-form-urlencoded') &&
    !type.startsWith('multipart/form-data')
  ) {
    return null;
  }
  try {
    return await request.formData();
  } catch {
    return null;
  }
}
