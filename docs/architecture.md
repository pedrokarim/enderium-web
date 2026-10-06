# Architecture

## Vue d’ensemble

```
 Navigateur ──► apps/web (Next.js, rendu serveur)
                  │  gardes : requirePermission(…)         ◄── Ascencia ID (OIDC)
                  │
                  ▼
            packages/game-db ──SELECT──►  Base d'Enderium  ◄──lit/écrit── plugins du serveur
                  │                       (PostgreSQL,                    (EnderiumData, Economy,
                  └──INSERT link_intents►  MariaDB ou SQLite)              Permissions, Regions…)
                                               ▲
                                               └── EnderiumLink : réclame les intentions,
                                                   vérifie la signature, exécute par les API
                                                   des modules, écrit le résultat
```

Le site n’a **pas de base à lui**. Tout ce qu’il affiche vient de la base du
jeu ; tout ce qu’il fait passe par `link_intents`, qui sert aussi de journal
des actions de l’équipe. La session vit dans un cookie chiffré.

## Pourquoi des intentions plutôt qu’une écriture directe

Les plugins gardent en mémoire les joueurs connectés et écrivent en différé.
Un `UPDATE` venu du site serait écrasé par le cache du serveur, ou ignoré
jusqu’à la reconnexion du joueur, et n’apparaîtrait dans aucun journal du jeu.
En passant par l’API du module (la même que la commande en jeu), l’action est
appliquée tout de suite, au bon endroit, et journalisée comme les autres.
Détail du protocole : [`contracts/intents.md`](contracts/intents.md).

Conséquence pour l’interface : une action n’est pas « faite » quand on clique,
elle est **déposée**. L’écran montre son état (en attente, en cours, faite,
refusée, échouée, expirée) et le journal des actions garde tout.

## Les trois moteurs

Le plugin EnderiumData choisit PostgreSQL, sinon MariaDB, sinon SQLite. Le site
suit par `ENDERIUM_DB_URL`. `game-db` écrit son SQL avec Kysely, sans fonction
propre à un moteur, et normalise ce que les pilotes rendent différemment
(`BIGINT`, booléens). En développement, il ouvre le fichier SQLite du serveur
de test en lecture seule.

Des tables peuvent manquer selon les plugins installés : chaque domaine de
`game-db` rend alors un résultat vide et le dit (`meta.hasModule`), et l’écran
explique quel module manque au lieu de planter.

## Découpage de l’application

```
apps/web/src
  app/                 routes (App Router)
    console/           la console d'équipe : une page serveur par écran
    auth/              routes OIDC (connexion, retour, déconnexion)
  server/auth/         session, permissions, gardes
  components/          composants propres à l'application
  lib/                 mise en forme, libellés
```

- Une page est un **composant serveur** : elle vérifie la permission, lit par
  `game-db`, rend. Filtres, tri et pagination vivent dans l’adresse
  (`searchParams`) : un écran se partage et se recharge tel quel.
- Une action est une **action serveur** : permission, validation (zod), dépôt
  de l’intention, retour d’un état typé. Le composant client ne porte que le
  formulaire.
- Aucun composant client ne reçoit plus de données que ce qu’il affiche.

## Ce qui vient ensuite

| Espace            | Idée directrice                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Studio de contenu | Éditer les définitions du dépôt enderium-core (items, plantes, boutique…). Ce sont des **fichiers versionnés**, pas des lignes en base : le studio écrira dans le dépôt, pas dans la base. |
| Site public       | Les pages du doc 18 § 18.2 (accueil, herbier, classements, profil), sur les mêmes lectures `game-db`.                                                                                      |
