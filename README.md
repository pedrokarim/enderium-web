# Enderium Web

Le site d’Enderium. Premier espace livré : la **console d’équipe**, qui lit la
base commune du serveur et y dépose des actions que le serveur exécute. Le
studio de contenu et le site public viendront dans la même application.

## Démarrer

Prérequis : [Bun](https://bun.sh) ≥ 1.3 et Node ≥ 24.

```bash
bun install
cp .env.example .env.local     # puis remplir (voir ci-dessous)
bun run dev                    # http://localhost:3100
```

En développement, `.env.local` peut se limiter à :

```env
ENDERIUM_DB_URL=sqlite:../../../../enderium-core/core/run/plugins/EnderiumData/enderium.db
SESSION_SECRET=<48 octets aléatoires>
APP_URL=http://localhost:3100
ENDERIUM_DEV_AUTH=1
```

Le chemin SQLite est relatif à `apps/web`. La base du serveur de test est
ouverte en lecture seule ; le serveur peut tourner en même temps.

## Commandes

| Commande                          | Effet                                   |
| --------------------------------- | --------------------------------------- |
| `bun run dev`                     | Serveur de développement (port 3100)    |
| `bun run build` / `bun run start` | Construction et lancement de production |
| `bun run typecheck`               | Types de tous les packages              |
| `bun run lint`                    | ESLint, zéro avertissement toléré       |
| `bun run test`                    | Tests (vitest)                          |

## Plan du dépôt

| Dossier            | Rôle                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`         | L’application Next.js : `/console`, plus tard `/studio` et le site public                                                                                        |
| `packages/game-db` | Accès typé à la base d’Enderium (PostgreSQL, MariaDB, SQLite), dépôt des intentions                                                                              |
| `packages/ui`      | Design system « Ender »                                                                                                                                          |
| `docs/`            | [Feuille de route](docs/roadmap.md), [architecture](docs/architecture.md), [contrat des intentions](docs/contracts/intents.md), [authentification](docs/auth.md) |

Règles de travail : [`AGENTS.md`](AGENTS.md).
