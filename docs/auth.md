# Authentification et contrôle d’accès

Le site se connecte par **Ascencia ID**, le fournisseur d’identité maison
(OAuth 2.1 / OpenID Connect). Application de type `web` : code d’autorisation

- PKCE, client confidentiel, jetons côté serveur seulement.

Code : `apps/web/src/server/auth/`, routes sous `apps/web/src/app/auth/`,
proxy dans `apps/web/src/proxy.ts`. Tests : `apps/web/tests/auth/`.

> **État au 2026-10-06.** Tout est écrit et testé contre un **faux
> fournisseur** (vrais jetons ES256, vraie vérification). Rien n’a encore été
> essayé contre le vrai Ascencia ID : la section 10 liste ce qu’il reste à
> vérifier, et la section 7 ce qu’il faut créer là-bas avant le premier essai.

## 1. Utilisation dans les pages

```ts
import { requirePermission, requireUser, getSession, can } from '@/server/auth';

// Page ou action serveur : c'est ICI que se fait le contrôle.
const user = await requirePermission('economy.write');

// Affichage seulement (masquer un bouton) : ce n'est pas un contrôle.
if (can(user, 'permissions.write')) { … }
```

| Fonction                                     | Rôle                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `getSession(): Promise<ConsoleUser \| null>` | La personne connectée, ou `null`. Mémoïsée par requête (`cache` de React). |
| `requireUser(): Promise<ConsoleUser>`        | Sans session : redirection vers `/sign-in?returnTo=…`.                     |
| `requirePermission(p): Promise<ConsoleUser>` | Connecté sans le droit : redirection vers `/denied?permission=…`.          |
| `can(user, p): boolean`                      | Test synchrone, pour l’affichage.                                          |

```ts
interface ConsoleUser {
  id: string; // identifiant de compte Ascencia ID (`sub`), stable
  displayName: string;
  avatarUrl: string | null;
  minecraftUuid: string | null; // null tant qu'Ascencia ID ne le transmet pas (§ 10)
  roles: readonly string[];
  permissions: ReadonlySet<ConsolePermission>;
}
```

**Règle** (AGENTS.md § 2) : toute page et toute action de la console appelle
`requirePermission`. Une action serveur le rappelle elle-même : elle est
joignable sans passer par la page qui affiche son bouton.

Pour les pages `/sign-in` et `/denied` :

```tsx
import { getSignInOptions, SIGN_OUT_ACTION } from '@/server/auth';

const options = getSignInOptions(await searchParams);
// options.ascencia.configured, options.ascencia.href      → bouton « Se connecter » (lien GET)
// options.devAuth.enabled, .action, .profiles             → formulaire POST (champs `profile`, `returnTo`)
// options.returnTo, options.errorMessage, options.signedOut, options.misconfigured

<form method="post" action={SIGN_OUT_ACTION}>…</form>           // déconnexion locale
<input type="hidden" name="global" value="1" />                 // + quitter Ascencia ID aussi
```

## 2. Le parcours

```
Navigateur            apps/web                              Ascencia ID
    │  GET /console        │                                     │
    │─────────────────────►│ proxy : pas de session              │
    │◄─ 307 /sign-in?returnTo=/console                           │
    │  clic « Se connecter »                                     │
    │─ GET /auth/sign-in ─►│ state + nonce + PKCE (S256)         │
    │                      │ → cookie de transaction chiffré     │
    │◄─ 302 /oauth/authorize?…code_challenge…state…nonce ────────│
    │──────────────────────────────────────────────────────────►│ connexion, MFA, politique d'accès
    │◄─ 302 /auth/callback?code=…&state=…&iss=… ─────────────────│
    │─ GET /auth/callback ►│ 1. state == transaction ?           │
    │                      │ 2. POST /oauth/token (code, verifier, secret) ─►│
    │                      │ 3. jeton d'identité : signature JWKS, iss, aud, exp, nonce
    │                      │ 4. jeton d'accès : signature, iss, aud, exp ; même `sub`
    │                      │ 5. perms → permissions de la console
    │                      │ 6. GET /oauth/userinfo (nom, avatar) ─────────►│
    │◄─ 303 /console + cookie de session chiffré                 │
```

| Route               | Méthode | Ce qu’elle fait                                                                                                                                                                                    |
| ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/sign-in`     | GET     | Tire `state`, `nonce` et le vérificateur PKCE, les scelle dans un cookie de 10 minutes, redirige vers Ascencia ID. `?returnTo=` est validé ; `?prompt=` accepte `login`, `select_account`, `none`. |
| `/auth/callback`    | GET     | Vérifie, échange, ouvre la session. Tout échec renvoie vers `/sign-in?error=<code>` sans ouvrir de session. La transaction est effacée quelle que soit l’issue.                                    |
| `/auth/sign-out`    | POST    | Contrôle d’origine, révocation du jeton de renouvellement chez le fournisseur, effacement du cookie. Avec `global=1` : redirection vers la fin de session d’Ascencia ID.                           |
| `/auth/dev-sign-in` | POST    | Connexion locale. 404 hors du mode développement (§ 6).                                                                                                                                            |

Ce qui est repris des SDK publiés (`0.1.0-rc.1`) : `AscenciaClient` de
`@ascencia/id-core` (découverte, URL d’autorisation, PKCE, échange du code,
renouvellement, profil) et `createVerifier` de `@ascencia/id-server`
(vérification du jeton d’accès contre le JWKS, liste blanche ES256).

L’adaptateur `@ascencia/id-server/next` n’est pas utilisé : le site garde la
main sur la transaction PKCE (cookie chiffré), la vérification du jeton
d’identité et du `nonce`, la déconnexion en POST et la session en cookie.

### Validation de `returnTo`

Chemin interne seulement (`return-to.ts`). Refusés : URL absolue, `//hôte`,
`/\hôte`, caractères de contrôle, tout ce qui se résout hors du site, et les
routes `/auth/…` (boucle). La valeur est validée à l’entrée **et** relue à la
sortie du cookie de transaction.

### Codes d’échec (`/sign-in?error=…`)

`not_configured`, `provider_unavailable`, `provider_error`, `access_denied`,
`login_required`, `invalid_state`, `exchange_failed`, `invalid_token`,
`permissions_unavailable`, `impersonation_refused`, `session_ended`. Les
messages en français sont dans `errors.ts` ; `getSignInOptions` rend
directement le texte à afficher.

## 3. Le modèle de session

Un seul cookie, **chiffré**, sans magasin côté serveur (le site n’a pas de
base à lui).

| Propriété            | Valeur                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Nom                  | `__Host-enderium_session` en production, `enderium_session` en http local                                         |
| Attributs            | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, pas de `Domain`                                                   |
| Format               | JWE compact, `alg: dir`, `enc: A256GCM` (`jose`)                                                                  |
| Clé                  | HKDF-SHA-256 de `SESSION_SECRET`, une clé par usage (session, transaction)                                        |
| Durée absolue        | **8 h** depuis la connexion, jamais repoussée                                                                     |
| Inactivité           | **2 h**, repoussée à chaque renouvellement des droits                                                             |
| Fraîcheur des droits | redemandés après **5 min** ; session refusée au-delà de **15 min** sans confirmation ; **60 s** pour une écriture |

Contenu : identifiant de compte, nom affiché, avatar, UUID Minecraft, rôles,
permissions de la console (les dix clés, jamais un motif brut), les quatre
dates, l’identifiant de session SSO, le **jeton de renouvellement** et le
jeton d’identité (pour la déconnexion chez le fournisseur). Le jeton d’accès
n’est **pas** gardé : il ne sert qu’au moment de la connexion.

Le navigateur détient donc un jeton de renouvellement, mais **chiffré** : il
ne peut ni le lire ni le modifier, aucun script de la page n’y a accès, et il
est inutilisable sans le secret du client, qui ne quitte pas le serveur.
C’est le compromis d’un site sans base : l’alternative (magasin en mémoire)
déconnecterait tout le monde à chaque redémarrage et ne survivrait pas à une
deuxième instance.

### Comment les droits restent à jour

**Choix : renouvellement par jeton de renouvellement, fait par le proxy.**

Ascencia ID recalcule les droits à chaque renouvellement
(`loadContext(…, { skipCache: true })` dans sa route `/oauth/token`) et refuse
le renouvellement d’un compte banni, retiré de l’application ou dont la
session a été révoquée. Le site s’appuie là-dessus :

1. À chaque requête, le proxy ouvre le cookie. Si les droits datent de plus de
   **5 minutes**, il renouvelle le jeton, traduit les nouveaux droits et
   réécrit le cookie – avant que la page ne soit rendue.
2. Une requête qui **modifie** quelque chose sous `/console` ou `/studio`
   (POST, action serveur) exige des droits de moins de **60 secondes** : le
   proxy les redemande d’abord. Si Ascencia ID ne répond pas, l’écriture est
   refusée (503) plutôt qu’exécutée avec des droits non confirmés.
3. `getSession()` refuse toute session dont les droits n’ont pas été confirmés
   depuis **15 minutes**, même si le cookie est encore valide. C’est la borne
   dure : elle tient même si le proxy est contourné ou le fournisseur en panne.
4. Renouvellement refusé par le fournisseur → cookie effacé, retour à la
   connexion (`session_ended`).

**Conséquence pour un rôle retiré :** la personne perd ses droits d’écriture
à sa prochaine action (au pire 60 secondes plus tard), et ses droits de
lecture en 5 minutes au plus ; 15 minutes dans le pire des cas, si Ascencia ID
est injoignable pendant tout ce temps.

Pourquoi pas l’introspection : elle dit si un jeton est encore actif, pas
quels droits il porterait aujourd’hui (la route renvoie les revendications du
jeton tel qu’émis). Pourquoi pas `userinfo` : il ne rend que l’identité.
Pourquoi le proxy : un composant serveur ne peut pas écrire de cookie, et le
proxy est le seul point qui voit toutes les requêtes.

**Rotation et requêtes simultanées.** Ascencia ID fait tourner le jeton à
chaque usage et prend le rejeu d’un jeton consommé pour un vol (famille et
session SSO révoquées). `refresher.ts` garantit donc un seul appel par jeton à
la fois, et garde le résultat 2 minutes pour les requêtes parties avec
l’ancien cookie. **Limite :** ceci vit dans la mémoire d’un processus. Avec
plusieurs instances derrière un répartiteur, il faudra un verrou partagé
(ou des sessions collantes) avant de monter en charge.

**Sans jeton de renouvellement** (scope `offline_access` non accordé à
l’application) : la session vit 15 minutes, puis le proxy repasse par
`/auth/sign-in`, invisible tant que la session SSO est en vie. Ça fonctionne,
mais les écritures ne bénéficient plus de la règle des 60 secondes.

## 4. Permissions de la console

Vocabulaire fixé dans `permissions.ts` (type `ConsolePermission`) :

`console.access`, `players.read`, `economy.read`, `economy.write`,
`permissions.read`, `permissions.write`, `regions.read`, `moderation.read`,
`journal.read`, `studio.access`.

Ces clés sont déclarées **telles quelles** dans l’application côté Ascencia ID
et arrivent dans la revendication `perms` du jeton d’accès (scope
`ascencia.perms`), éventuellement sous forme de motifs (`economy.*`, `*`). Le
site les développe avec `evaluate` du SDK – la même fonction que côté
fournisseur – et ne garde que les dix clés connues.

Deux règles propres au site :

- **`console.access` est la porte.** Sans elle, les droits de la console sont
  retirés (seul `studio.access` en est indépendant). Un rôle mal composé ne
  donne rien.
- **Pas de droits inventés.** Si le jeton n’a pas de revendication `perms`
  (scope non accordé) ou si elle est tronquée, la connexion échoue avec
  `permissions_unavailable`.

Refusés à la connexion : les jetons de service, les membres dont l’adhésion
n’est pas `active`, et les **sessions d’assistance** (impersonation, claim
`act`) – la console écrit un journal nominatif et crédite des comptes.

### Rôles proposés → permissions

Déclarés dans [`ascencia.manifest.json`](../ascencia.manifest.json), à la
racine du dépôt. Un test vérifie que ce fichier et `permissions.ts` disent la
même chose.

| Permission          | `support` | `moderator` | `admin` | `owner` |
| ------------------- | :-------: | :---------: | :-----: | :-----: |
| `console.access`    |    oui    |     oui     |   oui   |   oui   |
| `players.read`      |    oui    |     oui     |   oui   |   oui   |
| `economy.read`      |    oui    |     oui     |   oui   |   oui   |
| `journal.read`      |    oui    |     oui     |   oui   |   oui   |
| `moderation.read`   |     –     |     oui     |   oui   |   oui   |
| `regions.read`      |     –     |     oui     |   oui   |   oui   |
| `permissions.read`  |     –     |      –      |   oui   |   oui   |
| `economy.write`     |     –     |      –      |   oui   |   oui   |
| `permissions.write` |     –     |      –      |   oui   |   oui   |
| `studio.access`     |     –     |      –      |   oui   |   oui   |

`support` : lecture seule. `moderator` hérite de `support`, `admin` de
`moderator`, `owner` d’`admin` avec `*` (il reçoit donc aussi les permissions
ajoutées plus tard). Le rôle par défaut `user`, qu’Ascencia ID attribue à
toute première connexion, reste **sans aucune permission**.

## 5. Protection CSRF

- **Actions serveur** : Next 16 n’accepte que POST et compare l’en-tête
  `Origin` à l’hôte de la requête (`Host` / `X-Forwarded-Host`). Rien à
  ajouter, à condition que le répartiteur transmette l’hôte public.
- **Route handlers POST** : Next ne contrôle rien. `csrf.ts` compare `Origin`
  à `APP_URL` (repli : `Sec-Fetch-Site`, puis `Referer` ; aucun indice =
  refus). Utilisé par `/auth/sign-out` et `/auth/dev-sign-in`, à réutiliser
  pour toute future route POST : `isSameOriginRequest(request, config.appOrigin)`.
- **Cookie** `SameSite=Lax` : un POST venu d’un autre site n’emporte pas la
  session. Le contrôle d’origine couvre en plus les sous-domaines voisins.
- **Retour d’autorisation** : `state` lié au cookie de transaction (CSRF de
  connexion), `nonce` lié au jeton d’identité (rejeu), paramètre `iss`
  comparé à l’émetteur (confusion de fournisseur, RFC 9207).

## 6. Mode développement

`ENDERIUM_DEV_AUTH=1` **et** `NODE_ENV` différent de `production` : la route
`POST /auth/dev-sign-in` ouvre une session « Développeur local » sans
Ascencia ID. Champ `profile` : `full` (tous les droits) ou `read-only`
(lecture seule), pour essayer les deux visages de la console.

En production, quatre verrous indépendants :

1. la configuration refuse de se charger si `ENDERIUM_DEV_AUTH=1`, et
   `src/instrumentation.ts` la charge au démarrage : le serveur ne démarre pas ;
2. la route répond 404 dès que `NODE_ENV=production`, avant de lire quoi que
   ce soit d’autre ;
3. elle répond 404 aussi si la configuration dit « production » ;
4. une session de développement est refusée par le proxy et par `getSession()`
   quand le mode est fermé – un cookie fabriqué ailleurs ne servirait à rien.

## 7. À créer dans la console d’Ascencia ID

1. **Application** – zone : celle de l’équipe (pas la zone publique si elle
   existe à part). Nom : Enderium. Slug : `enderium-web`. **Type : `web`**
   (client confidentiel). Récupérer `client_id` et `client_secret`.
2. **URI de redirection** (comparaison exacte, une par environnement) :
   - `https://enderium.ascencia.re/auth/callback`
   - `http://localhost:3100/auth/callback` (acceptée hors production seulement)
3. **URI de retour après déconnexion** (`post_logout_redirect_uris`) :
   - `https://enderium.ascencia.re/sign-in`
   - `http://localhost:3100/sign-in`
4. **Scopes autorisés** de l’application : `openid`, `profile`,
   `offline_access`, `ascencia.roles`, `ascencia.perms`. Le défaut à la
   création est `openid profile email` : sans `ascencia.perms`, personne
   n’obtient de droits (`permissions_unavailable`) ; sans `offline_access`,
   pas de jeton de renouvellement (§ 3).
5. **Types d’autorisation** : `authorization_code` et `refresh_token`
   (c’est le défaut). **PKCE requis** : oui (défaut).
6. **Politique d’accès** : `invite_only` (ou `role_gated` sur les rôles
   ci-dessous). Avec le défaut `open` + adhésion automatique, n’importe quel
   membre de la zone peut se connecter ; il n’obtient aucun droit et tombe sur
   `/denied`, mais autant l’arrêter chez le fournisseur.
7. **Élévation plateforme** (`allow_platform_override`) : laisser à **non**.
   Sinon un administrateur d’Ascencia ID reçoit `*` sur la console sans qu’un
   rôle lui ait été attribué.
8. **Permissions et rôles** : pousser `ascencia.manifest.json`
   (`PUT /api/v1/admin/apps/<id>/manifest`), ou les saisir à la main – les dix
   permissions du § 4 et les rôles `support`, `moderator`, `admin`, `owner`.
   Le manifeste met à jour les rôles `admin` et `owner` semés à la création
   (leurs permissions par défaut `members.*`, `roles.*`, `settings.*` ne
   veulent rien dire ici). Limiter `owner` à un ou deux porteurs.
9. **Composer ces rôles d’autorisations seulement**, sans règle de refus : le
   site ne lit que la liste des permissions accordées.
10. **S’attribuer `owner`**, puis attribuer les rôles à l’équipe.
11. Durée du jeton d’accès : laisser 10 minutes. Durée du jeton de
    renouvellement : le défaut (60 jours) est sans effet ici, la session du
    site s’arrête à 8 heures ; on peut la réduire à 1 jour.

## 8. Variables d’environnement

| Variable                 | Obligatoire   | Contrôle                                                         |
| ------------------------ | ------------- | ---------------------------------------------------------------- |
| `APP_URL`                | oui           | Origine seule (pas de chemin). `https`, ou `http` sur localhost. |
| `SESSION_SECRET`         | oui           | 32 octets au moins, aléatoire. `openssl rand -base64 48`.        |
| `ASCENCIA_ISSUER`        | en production | `https` (ou `http` local).                                       |
| `ASCENCIA_CLIENT_ID`     | en production |                                                                  |
| `ASCENCIA_CLIENT_SECRET` | en production |                                                                  |
| `ASCENCIA_REDIRECT_URI`  | en production | Doit valoir exactement `APP_URL` + `/auth/callback`.             |
| `ENDERIUM_DEV_AUTH`      | non           | `0` ou `1`. `1` interdit en production.                          |

Hors production, le site démarre sans client Ascencia ID
(`ASCENCIA_CLIENT_ID` et `ASCENCIA_CLIENT_SECRET` vides) : seule la connexion
locale est alors proposée. La validation (`config.ts`, zod) se fait au premier
usage, et au démarrage en production. Un message d’erreur nomme la variable et
ce qui est attendu, **jamais** la valeur reçue.

Changer `SESSION_SECRET` déconnecte tout le monde : c’est aussi le moyen de
couper toutes les sessions d’un coup.

## 9. En-têtes de sécurité

Posés pour toutes les réponses dans `apps/web/next.config.ts` :
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
(tout fermé), `Strict-Transport-Security` (2 ans, sous-domaines),
`Cross-Origin-Opener-Policy: same-origin`, `X-Robots-Tag: noindex, nofollow`,
et un socle de CSP. `poweredByHeader: false`.

La **CSP complète** est posée par le proxy, avec un nonce par requête :
`script-src 'self' 'nonce-…' 'strict-dynamic'` – aucun script en ligne sans
nonce, pas d’`eval` en production. `form-action` n’autorise que le site et
Ascencia ID ; `frame-ancestors 'none'` ; `object-src 'none'` ; `base-uri 'self'`.

Deux concessions, assumées :

- `style-src 'unsafe-inline'` : React écrit des attributs `style` au rendu
  serveur, et un nonce ne couvre pas les attributs.
- Le nonce exige que les pages soient **rendues à la demande**. C’est le cas
  de tout le site parce que la mise en page racine lit un cookie (le thème).
  Une page qui deviendrait statique perdrait ses scripts : à garder en tête si
  la mise en page change.

## 10. Ce qui reste à vérifier contre le vrai Ascencia ID

Rien de ce qui suit n’a pu être essayé (pas de client créé, pas de
`.env.local`).

1. **Le parcours de bout en bout** : découverte, redirection, échange,
   forme réelle des deux jetons (`nonce` dans le jeton d’identité, `perms` et
   `roles` dans le jeton d’accès), `iss` dans l’URL de retour.
2. **La forme exacte de la revendication `perms`** pour un rôle qui combine
   autorisations et refus. D’ici là, les rôles ne portent que des
   autorisations (§ 7).
3. **`offline_access`** : qu’un jeton de renouvellement est bien émis, qu’il
   tourne, et que le renouvellement rend les droits du moment (retirer un rôle,
   attendre 5 minutes, constater).
4. **Retrait d’accès** : bannir un membre ou révoquer sa session doit faire
   échouer le renouvellement suivant (`invalid_grant`) et fermer la session du
   site.
5. **Déconnexion globale** : `GET /oauth/logout?id_token_hint=…&post_logout_redirect_uri=…`
   doit revenir sur `/sign-in` (URI enregistrée au § 7.3), y compris avec un
   jeton d’identité expiré.
6. **`/oauth/revoke`** avec `client_secret` dans le corps du formulaire.
7. **UUID Minecraft** : Ascencia ID ne l’émet pas (liaison Minecraft prévue,
   non livrée). Le site lit une revendication `minecraft_uuid` dans le jeton
   d’accès ou le jeton d’identité si elle existe ; sinon `minecraftUuid` vaut
   `null`. Le nom de la revendication est à convenir.
8. **Derrière le répartiteur de production** : `X-Forwarded-Host` transmis
   (contrôle d’origine des actions serveur), cookie `__Host-` accepté, CSP
   sans erreur dans la console du navigateur sur chaque écran.
9. **Compilation des SDK** : ils sont publiés en TypeScript source ;
   `transpilePackages` les déclare dans `next.config.ts`. À confirmer par un
   `next build` complet.

## 11. Pistes, non faites

- **Déconnexion par canal arrière** (`backchannel_logout_uri`) : sans magasin
  de sessions, le site ne peut pas tuer une session sur ordre. La révocation
  passe par le renouvellement (5 minutes au plus). Une liste de sessions SSO
  révoquées en mémoire réduirait ce délai à zéro.
- **Second facteur exigé pour les écritures** : le jeton porte `aal` ; on
  pourrait retirer `*.write` à une session ouverte sans MFA.
- **Webhook `roles.changed`** : même limite que le canal arrière.
