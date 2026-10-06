# Cadrage et feuille de route

> Document de début de projet, écrit le 2026-10-06. Il dit ce qu’est le site
> d’Enderium, ce qu’il ne sera pas, et dans quel ordre ses morceaux arrivent.
> Un jalon est atteint quand ses **critères de sortie** sont vérifiés, pas
> quand son code est écrit.

## 1. Ce qu’on construit

Enderium est un serveur Minecraft dont presque tout est fait maison : items,
plantes, créatures, métiers, économie, grades, zones, donjons. Le site est son
pendant hors du jeu. Il a trois espaces, dans une seule application :

| Espace                            | Pour qui                            | Ce qu’il permet                                                                             |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| **Console d’équipe** (`/console`) | L’équipe du serveur                 | Voir l’état du serveur et de ses données, et agir : grades, comptes, modération             |
| **Studio de contenu** (`/studio`) | Les personnes qui créent le contenu | Consulter et éditer les définitions du jeu (items, plantes, boutique…)                      |
| **Site public** (`/`)             | Les joueurs                         | Découvrir le serveur, suivre sa progression, les classements, la boutique en monnaie du jeu |

## 2. Les principes qui ne bougent pas

1. **Le serveur de jeu est le seul écrivain de ses données.** Le site lit la
   base commune ; pour agir, il dépose une intention signée que le serveur
   exécute par ses propres API ([contrat](contracts/intents.md)). Une action
   du site laisse donc les mêmes traces qu’une commande en jeu.
2. **Aucun port entrant sur la machine du jeu.** C’est le serveur qui vient
   chercher son travail.
3. **Tout droit se vérifie côté serveur du site**, par permission, à chaque
   page et à chaque action ([authentification](auth.md)).
4. **Tout ce que l’équipe fait est journalisé**, avec son auteur et son motif,
   et ce journal n’est jamais purgé.
5. **Le contenu du jeu vit dans des fichiers versionnés**, pas en base : le
   studio écrira dans le dépôt du serveur, avec relecture, jamais directement
   sur un serveur en marche.
6. **Le site est un confort, pas un privilège.** Rien de ce qu’un joueur y
   obtient ne lui donne un avantage qu’il n’aurait pas en jeu.
7. **Un écran n’est livré qu’après avoir été rendu** : capture à plusieurs
   largeurs, dans les deux thèmes, sans débordement.

## 3. Les jalons

Chaque jalon dévoile quelque chose d’utilisable. Les versions se calculent
depuis les commits ; un jalon se marque par une étiquette (`jalon-1`…), pas
par un numéro de version choisi à la main.

### Jalon 0 – Le socle · atteint le 2026-10-06

Ce qui existe et a été vérifié :

- le dépôt, ses règles et ses contrôles (types, lint, tests, build) ;
- l’accès typé à la base du jeu sur trois moteurs (PostgreSQL, MariaDB,
  SQLite), qui tolère l’absence d’un module ;
- le design system « Ender », en thèmes clair et sombre ;
- la connexion par Ascencia ID, les sessions, dix permissions ;
- la console en lecture : vue d’ensemble, joueurs, économie, grades, zones,
  signalements, journal des actions ;
- quatre actions : donner ou retirer un grade, créditer ou débiter un compte ;
- côté serveur, le plugin qui réclame et exécute ces actions.

Ce qui n’est **pas** encore vrai : aucune action n’a été exécutée par un vrai
serveur, et la connexion n’a tourné que contre un faux fournisseur d’identité.

### Jalon 1 – La mise en service

**Dévoile** : la console utilisée pour de vrai par l’équipe, sur le serveur de
test.

- Créer l’application dans Ascencia ID et se connecter avec un vrai compte.
- Charger le plugin de lien sur le serveur de test, partager le secret.
- Jouer les quatre actions de bout en bout, y compris les refus (solde
  insuffisant, grade inconnu, serveur éteint).
- Intégration continue, calcul de version, étiquettes de jalon.
- Le battement du serveur annonce la version du contrat qu’il parle ; la
  console prévient quand le site et le serveur ne s’accordent plus.
- Premier déploiement (image, variables, compte de base en lecture seule).

**Critères de sortie** : une personne de l’équipe, connectée par Ascencia ID,
donne un grade depuis la console et le voit appliqué en jeu ; l’action figure
au journal du site et au journal du jeu ; la base de production est
PostgreSQL et le compte du site n’y a que les droits prévus.

### Jalon 2 – La console complète

**Dévoile** : l’équipe n’a plus besoin d’une commande en jeu pour son travail
courant.

| Chantier           | Contenu                                                                                            | Dépend du serveur                               |
| ------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Modération         | Traiter un signalement, sanctionner (avertir, exclure, bannir), historique d’un joueur             | Un module de sanctions, qui n’existe pas encore |
| Grades             | Créer et régler un grade, ses droits, son héritage                                                 | Actions à ajouter au contrat                    |
| Zones              | Drapeaux, membres et rôles, priorité, avec une carte du contour                                    | Actions à ajouter au contrat                    |
| Économie           | Indicateurs complets : sources et puits par période, concentration, indice des prix, alertes       | Lecture seule                                   |
| Marché et boutique | Annonces, cours, stocks et prix de la boutique du serveur                                          | Lecture, puis actions                           |
| Confort            | Libellés lus dans les traductions du jeu, têtes des joueurs, recherche globale, export d’une liste | –                                               |

**Critères de sortie** : chaque action a son test des deux côtés, son refus
expliqué à l’écran, et sa permission ; les rôles de l’équipe sont répartis et
essayés un par un.

### Jalon 3 – Le studio de contenu

**Dévoile** : le contenu du jeu se consulte, puis se modifie, hors d’un
éditeur de texte.

1. **Lire** : parcourir les définitions du dépôt du serveur (items, plantes,
   créatures, quêtes, boutique, traductions), avec leurs rendus et leurs
   liens (où cet item est-il vendu, lâché, demandé ?).
2. **Valider** : signaler ce qui est cassé (clé de traduction absente,
   référence à un item inconnu, prix incohérent).
3. **Écrire** : une modification devient une proposition relue (une branche et
   une demande de fusion), jamais une écriture directe.

**Critères de sortie** : un changement de prix fait dans le studio arrive en
jeu par le circuit normal de publication du serveur, sans retouche à la main.

### Jalon 4 – Le site public

**Dévoile** : Enderium se présente et se suit depuis un navigateur.

- Accueil, présentation du jeu, état du serveur.
- Liaison du compte : un code affiché sur le site, tapé en jeu.
- Profil d’un joueur, classements, herbier et bestiaire, calendrier.
- Français d’abord, anglais ensuite.

**Critères de sortie** : pages publiques indexables une à une, lisibles sans
compte ; aucune donnée personnelle exposée (ni adresse IP, ni position) ; un
joueur peut retirer son profil de l’affichage public.

### Jalon 5 – La boutique en monnaie du jeu

**Dévoile** : acheter depuis le site, avec les pièces gagnées en jeu.

- Catalogue identique à celui du jeu, au même prix.
- Achat par intention, livré dans la boîte de retrait du joueur, même hors
  ligne ; idempotent de bout en bout.
- Garde-fous : délai après une liaison de compte, plafond par jour,
  confirmation en jeu au-delà d’un seuil.

**Critères de sortie** : un achat rejoué deux fois n’est débité qu’une fois ;
un achat fait serveur éteint expire sans débit ; chaque achat se retrouve dans
le journal de l’économie.

## 4. Hors périmètre

- **Aucune vente contre de l’argent réel** dans ces jalons. Si elle arrive un
  jour, ce sera un projet à part, cosmétique seulement, avec ses mentions
  légales.
- **Pas de console distante du serveur** (commande libre, fichiers, redémarrage) :
  le site n’exécute que des actions nommées, prévues au contrat.
- **Pas d’écriture directe en base**, même « pour dépanner ».

## 5. Décisions ouvertes

| #   | Question                                                                                  | À trancher avant                    |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | Licence du dépôt                                                                          | La première contribution extérieure |
| 2   | Forme du module de sanctions côté serveur                                                 | Jalon 2                             |
| 3   | Comment le studio propose ses changements au dépôt du serveur (compte de service, droits) | Jalon 3                             |
| 4   | Ce qu’un profil public montre par défaut                                                  | Jalon 4                             |
| 5   | Seuil de confirmation en jeu et plafond quotidien de la boutique                          | Jalon 5                             |
| 6   | Nom de la monnaie                                                                         | Jalon 4                             |

## 6. Risques tenus à l’œil

| Risque                                                | Parade                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Le site et le serveur ne parlent plus le même contrat | Version du contrat dans le battement (jalon 1), vecteur de test commun             |
| Un rôle retiré garde l’accès                          | Droits redemandés au fournisseur toutes les cinq minutes, et avant chaque écriture |
| Une requête lente du site gêne le jeu                 | Compte en lecture seule, pagination bornée partout, réplica de lecture si besoin   |
| PostgreSQL et MariaDB jamais éprouvés                 | À jouer dans l’intégration continue dès le jalon 1                                 |
