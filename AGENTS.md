# Règles du dépôt – Enderium Web

Ce fichier fait autorité pour tout assistant qui travaille ici. `CLAUDE.md` ne
fait que pointer dessus. Le site suit les conventions d’Ascencia ID
(`project-ascencia/auth/AGENTS.md`) : mêmes outils, mêmes règles de langue.

## 1. Ce qu’est ce dépôt

Le site d’Enderium (`enderium.ascencia.re`). Trois espaces, dans une seule
application Next.js :

| Espace                | Route      | État                                                  |
| --------------------- | ---------- | ----------------------------------------------------- |
| **Console d’équipe**  | `/console` | en construction : c’est le premier chantier           |
| **Studio de contenu** | `/studio`  | prévu (éditer les définitions du dépôt enderium-core) |
| **Site public**       | `/`        | prévu (doc 18 § 18.2 d’enderium-core)                 |

Cadrage : `enderium-core/docs/game-design/18-website-and-shop.md` et
`12-platform.md`. Dictionnaire des tables lues : `enderium-core/docs/data/`.

## 2. Architecture

```
apps/web            Application Next.js (App Router). Aucun SQL ici.
packages/game-db    Accès typé à la base d'Enderium (PostgreSQL, MariaDB, SQLite)
                    et dépôt des intentions. Seul endroit qui parle à la base.
packages/ui         Design system « Ender » : tokens, primitives, coquille.
docs/               Architecture, contrats, décisions.
```

Trois règles tiennent l’ensemble :

1. **Le site ne modifie jamais une donnée de jeu.** Il lit, et il dépose des
   intentions que le serveur exécute (`docs/contracts/intents.md`). Aucun
   `UPDATE`, aucun `DELETE`, nulle part.
2. **Tout accès à la base passe par `@enderium/game-db`**, côté serveur
   seulement (composants serveur, actions serveur, routes). Jamais depuis un
   composant client.
3. **Toute page et toute action de la console vérifie une permission**
   (`requirePermission`), côté serveur. Masquer un bouton n’est pas un contrôle.

La base tourne sur trois moteurs : le SQL de `game-db` passe par Kysely et
reste portable (pas de fonction propre à un moteur hors d’un dialecte isolé).
Les `BIGINT` (dates en millisecondes, montants) sont rendus en `number`.

## 3. Langue

| Quoi                                                       | Langue                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Identifiants (variables, fonctions, types, fichiers, clés) | **anglais, sans exception**                                                                                                          |
| Commentaires et JSDoc                                      | français                                                                                                                             |
| Textes affichés                                            | français (`packages/ui` passe par son dictionnaire ; `apps/web` peut rester en français littéral tant que la console est monolingue) |
| Documentation, messages de commit                          | français                                                                                                                             |

Typographie française dans les textes : tiret demi-cadratin `–`, jamais de
cadratin ; guillemets « … » ; espace insécable avant `: ; ! ?` ; `…`.

## 4. Design system

`@enderium/ui` est la seule source de l’interface. Sa direction s’appelle
**« Atelier »** : celle des menus d’Enderium en jeu, portée sur le web (choisie
par Karim le 2026-10-06, planche dans `docs/design/explorations/`).

- **Deux plans** : le châssis sombre (`bg-chrome`, barre latérale, barre du
  haut) et le panneau gris où vit le contenu (`bg-bg`, encarts en `bg-surface`).
  Un texte posé sur le châssis prend `text-chrome-fg` / `text-chrome-fg-muted`,
  un bouton à plat y prend la variante `chrome`.
- **Contour noir de 2 px** (`border-line border-2`) sur tout ce qui est un
  objet : encart, bouton, étiquette, champ. **Aucun arrondi.**
- **Biseau** (`bevel`) sur ce qui est en relief (bouton, carte de chiffre,
  panneau), biseau inversé (`bevel-inset`) sur ce qui est en creux (champ).
- **Aplats saturés pour ce qui s’actionne** : vert valide, gris neutre, rouge
  retire, orange marque l’élément courant. Jamais comme décor.
- **Police en pixels** (`font-pixel`) pour les titres, chiffres clés, boutons,
  navigation, en-têtes de tableau et étiquettes. Le texte courant et les
  cellules de tableau restent en Inter.

- Dans `apps/` : pas de couleur en dur, pas de `var(--…)` dans un `className`,
  pas de bouton ni de carte habillés à la main. On utilise les utilitaires du
  thème (`bg-surface`, `text-fg-muted`, `rounded-field`…) et les composants.
- Un composant utilisé deux fois dans l’application remonte dans le package.
- **Aucune barre, bande ou bordure colorée décorative** autour d’une carte,
  d’un panneau ou d’une page. La couleur vit dans le texte, les icônes, les
  boutons, les pastilles et les fonds légers.
- **Aucun emoji ni caractère unicode comme icône** : Lucide, taille 16 dans un
  contrôle, 14 en ligne.
- Espacements sur la grille 4 / 8 / 12 / 16 / 24 px. Rien ne déborde : un écran
  n’est livré qu’après capture à 1440 et 1024 px.
- La console a une barre latérale : elle touche le bord, la zone principale
  prend le reste ; la largeur de lecture se pose sur le contenu.
- Contraste ≥ 4,5:1 ; la couleur n’est jamais seule porteuse d’un état.
- Polices auto-hébergées (`@fontsource-variable`), aucune requête tierce.

## 5. Ne jamais laisser le dépôt cassé

`bun run typecheck`, `bun run lint` et `bun run test` passent avant de dire
« c’est fait ». On ne conclut pas sur une lecture de code : on rend l’écran.
On tue le serveur de développement qu’on a lancé.

## 6. Git et secrets

- Auteur unique : Karim. Aucun trailer `Co-Authored-By`, aucune signature
  d’outil, dans un commit comme dans une PR.
- Ne jamais écrire `git config user.name` / `user.email`.
- Conventional Commits, sujet en français : `feat(console): …`. Portées :
  `web`, `console`, `studio`, `game-db`, `ui`, `auth`.
- `.env*` ignorés à tous les niveaux (sauf `.env.example`). Avant un premier
  push : scanner l’index (mots de passe, hôtes, clés, jetons).
- Ne citer aucun autre serveur ni plugin tiers dans les textes du site.
