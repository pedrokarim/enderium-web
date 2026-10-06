# Contrat « Lien » : comment le site agit sur le serveur

> Ce document fait foi pour les **deux** côtés : le site (`packages/game-db`,
> module `intents`) et le plugin `EnderiumLink` d’enderium-core (module Gradle
> `link/`). Toute évolution se décide ici d’abord, puis se code des deux côtés.
> Origine : `enderium-core/docs/game-design/18-website-and-shop.md`, § 18.4 et 18.6.

## 1. Les principes

1. **Le serveur est le seul écrivain des données de jeu.** Le site ne modifie
   jamais un solde, un grade ou une zone : il dépose une **intention** dans
   `link_intents`, le serveur la réclame et l’exécute par les API des modules
   (les mêmes que les commandes en jeu : caches à jour, journaux écrits).
2. **Le serveur tire.** Aucun port entrant sur la machine du jeu : le plugin
   interroge la base.
3. **Droits en base.** Le compte du site a `SELECT` sur les tables de jeu et
   `INSERT` sur `link_intents`, rien d’autre. Il ne fait jamais d’`UPDATE`.
4. **Signature.** Chaque intention est signée par un secret partagé
   (HMAC-SHA256). Un accès en écriture à la table ne suffit donc pas à faire
   exécuter une action.
5. **Idempotence.** Chaque intention porte une clé unique ; déposée deux fois,
   elle n’existe qu’une fois ; une intention n’est **jamais rejouée**
   automatiquement.
6. **Tout est journalisé.** `link_intents` est en ajout seul côté site et n’est
   jamais purgée par le code : c’est le journal des actions de l’équipe (qui,
   quoi, pourquoi, résultat).

## 2. Les tables (créées par la migration 1 du module `link`)

Conventions d’Enderium (`enderium-core/docs/data/README.md`) : dates en
`BIGINT` millisecondes UTC, `0` = absent ; chaînes absentes = `''` ; pas de
`NULL`.

### `link_intents`

| Colonne           | Type                       | Sens                                                         |
| ----------------- | -------------------------- | ------------------------------------------------------------ |
| `id`              | `VARCHAR(36)` clé primaire | UUID v4 en minuscules, généré par le site                    |
| `idempotency_key` | `VARCHAR(64)` unique       | Clé d’idempotence fournie par le site                        |
| `kind`            | `VARCHAR(48)`              | Type d’action (§ 4)                                          |
| `payload`         | `TEXT`                     | Objet JSON, tel que signé                                    |
| `target_server`   | `VARCHAR(32)`              | Serveur destinataire ; `''` = n’importe lequel               |
| `actor_id`        | `VARCHAR(64)`              | Sujet Ascencia ID de l’auteur (`sub`)                        |
| `actor_name`      | `VARCHAR(64)`              | Nom affiché de l’auteur au moment du dépôt                   |
| `actor_uuid`      | `VARCHAR(36)`              | UUID Minecraft lié à l’auteur, `''` sinon                    |
| `reason`          | `VARCHAR(255)`             | Motif saisi par l’auteur, une seule ligne                    |
| `status`          | `VARCHAR(12)`              | `pending`, `running`, `done`, `refused`, `failed`, `expired` |
| `created_at`      | `BIGINT`                   | Dépôt                                                        |
| `expires_at`      | `BIGINT`                   | Au-delà, une intention encore `pending` devient `expired`    |
| `claimed_at`      | `BIGINT`                   | Prise en charge par un serveur, `0` sinon                    |
| `claimed_by`      | `VARCHAR(32)`              | Identifiant du serveur qui l’a prise, `''` sinon             |
| `finished_at`     | `BIGINT`                   | Fin d’exécution, `0` sinon                                   |
| `result_code`     | `VARCHAR(48)`              | Code machine du résultat (§ 5), `''` tant que non finie      |
| `result_detail`   | `TEXT`                     | Objet JSON de détail, `''` sinon                             |
| `signature`       | `VARCHAR(64)`              | HMAC-SHA256 en hexadécimal minuscule (§ 3)                   |

Index : `(status, created_at)` ; `(actor_id, created_at)`.

Le site écrit toutes les colonnes de `id` à `expires_at` plus `signature`, avec
`status = 'pending'`, `claimed_at = 0`, `claimed_by = ''`, `finished_at = 0`,
`result_code = ''`, `result_detail = ''`. Le serveur seul écrit ensuite
`status`, `claimed_*`, `finished_at`, `result_*`.

### `link_servers`

Battement de cœur : une ligne par serveur, réécrite toutes les 15 secondes.

| Colonne             | Type                       | Sens                                                            |
| ------------------- | -------------------------- | --------------------------------------------------------------- |
| `server_id`         | `VARCHAR(32)` clé primaire | Identifiant du serveur (réglage `server-id`, défaut `survival`) |
| `started_at`        | `BIGINT`                   | Démarrage du plugin                                             |
| `seen_at`           | `BIGINT`                   | Dernier battement                                               |
| `plugin_version`    | `VARCHAR(32)`              | Version d’Enderium                                              |
| `minecraft_version` | `VARCHAR(32)`              | Version de Minecraft                                            |
| `online_players`    | `INT`                      | Joueurs connectés                                               |
| `max_players`       | `INT`                      | Places                                                          |
| `tps_centi`         | `INT`                      | TPS sur une minute × 100 (2000 = 20,00)                         |
| `mspt_centi`        | `INT`                      | Durée moyenne d’un tick en ms × 100                             |

Le site considère un serveur **en ligne** si `seen_at` date de moins de 45 s.

## 3. La signature

```
message   = "v1" \n id \n idempotency_key \n kind \n target_server \n actor_id \n
            actor_uuid \n created_at \n expires_at \n reason \n payload
signature = hex( HMAC-SHA256( secret, UTF-8(message) ) )
```

- Séparateur : un seul `\n` (U+000A). `created_at` et `expires_at` en décimal.
- `payload` est la chaîne **exacte** écrite en base (le serveur ne re-sérialise
  pas avant de vérifier). Il est en dernier : ses retours à la ligne sont sans
  effet sur le découpage.
- `reason`, `actor_*`, `kind`, `target_server` ne contiennent jamais de retour à
  la ligne (le site les refuse à la saisie, le serveur refuse l’intention sinon).
- Secret : 32 octets au moins. Site : variable `ENDERIUM_LINK_SECRET`.
  Serveur : variable d’environnement `ENDERIUM_LINK_SECRET`, sinon `secret` de
  `plugins/EnderiumLink/config.yml`. **Sans secret, le plugin n’exécute rien**
  (il continue d’écrire son battement de cœur) et le site n’offre aucune action.
- Comparaison à temps constant.

Vecteur de test (les deux côtés ont un test qui le vérifie) :

```
secret           = "enderium-link-test-secret-0123456789abcdef"
id               = "3f1c2a9e-5b7d-4c1a-9e2f-0a1b2c3d4e5f"
idempotency_key  = "console:3f1c2a9e"
kind             = "economy.deposit"
target_server    = ""
actor_id         = "asc_usr_test"
actor_uuid       = "069a79f4-44e9-4726-a5be-fca90e38aaf5"
created_at       = 1790000000000
expires_at       = 1790000600000
reason           = "Remboursement d'un achat perdu"
payload          = {"playerUuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5","amount":2500}
signature        = 9390a1b85c0cf260284754df062632a24b6867b1f218d6bf8beceff710f69cf1
```

L’apostrophe de `reason` est l’apostrophe droite `'` (U+0027).

## 4. Cycle de vie

```
site : INSERT (pending)
serveur, toutes les 5 s :
  1. UPDATE … SET status='expired'  WHERE status='pending' AND expires_at < maintenant
  2. SELECT les pending (target_server = '' ou le mien), par created_at, 20 au plus
  3. pour chacune : UPDATE … SET status='running', claimed_at, claimed_by
                    WHERE id = ? AND status = 'pending'      -> 1 ligne = prise
  4. vérifie signature, kind connu, payload valide -> sinon 'refused'
  5. exécute par l'API du module -> 'done', 'refused' (règle métier) ou 'failed' (exception)
au démarrage : toute intention restée 'running' ET prise par ce serveur (claimed_by)
               passe à 'failed' / `interrupted` (jamais rejouée : c'est à un humain
               de vérifier puis de redéposer). Celles d'un autre serveur ne sont pas touchées.
```

Sans secret (ou avec un secret de moins de 32 octets), le serveur ne fait
rien de ce cycle, pas même l’expiration. Un champ d’une seule ligne qui
contient un retour à la ligne vaut `bad_signature`.

`expires_at` vaut `created_at + 10 minutes` par défaut : si le serveur est
éteint, l’action n’est pas exécutée des heures plus tard par surprise.

## 5. Les actions de la version 1

`playerUuid` : UUID en minuscules avec tirets. Montants : entier positif, plus
petite unité de la monnaie.

| `kind`                | `payload`                                                                 | Effet                                      | Refus métier (`result_code`)            |
| --------------------- | ------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------- |
| `perms.member.add`    | `{"playerUuid","groupId","expiresAt"}` (`expiresAt` : ms, `0` = sans fin) | Donne le grade au joueur (contexte global) | `unknown_group`, `unknown_player`       |
| `perms.member.remove` | `{"playerUuid","groupId"}`                                                | Retire le grade                            | `unknown_group`, `not_member`           |
| `economy.deposit`     | `{"playerUuid","amount"}`                                                 | Crédite le compte                          | `unknown_account`                       |
| `economy.withdraw`    | `{"playerUuid","amount"}`                                                 | Débite le compte                           | `unknown_account`, `insufficient_funds` |

Codes communs : `ok` (succès), `bad_signature`, `unknown_kind`,
`invalid_payload`, `module_absent` (le module visé n’est pas installé),
`interrupted`, `internal_error`.

`result_detail` : objet JSON libre et court, par exemple
`{"balanceAfter":125000}` ou `{"message":"…"}`.

L’auteur est transmis aux modules comme acteur des journaux (`perms_log.actor_uuid`,
motif du mouvement dans `economy_ledger.reason`) : `actor_uuid` s’il est lié,
sinon l’UUID nul, et le motif vaut `site:<actor_name> | <motif>` (128 caractères
au plus). Les mouvements d’argent portent `kind = 'site'` dans `economy_ledger`.

Précisions tirées de l’implémentation du serveur :

- `economy.deposit` sur un compte qui n’existe pas rend `unknown_account` (le
  serveur lit le solde avant et après, et rend `{"balanceAfter"}`) ;
  `insufficient_funds` rend `{"balance"}`.
- `perms.member.add` avec une échéance déjà passée rend `invalid_payload` ;
  réussi, il rend `{"groupId","expiresAt"}`.
- `perms.member.remove` d’un grade hors catalogue mais encore porté le retire ;
  `unknown_group` n’est rendu que s’il n’y avait rien à retirer.

## 6. Ajouter une action

1. L’écrire dans le tableau du § 5 (kind, payload, refus).
2. Serveur : enregistrer un exécuteur pour ce `kind` dans le registre du plugin.
3. Site : ajouter le `kind` et le schéma de son `payload` dans
   `packages/game-db/src/intents/kinds.ts`, puis l’action dans l’écran.
4. Un test de chaque côté.
