/**
 * La progression d'un joueur, pour sa fiche : métiers, maîtrises, badges, quêtes, donjons et tour,
 * pêche, créatures tuées, cosmétiques, Éclats. Chaque rubrique vaut `null` quand son module n'est
 * pas installé : la fiche l'affiche comme « indisponible », pas comme « vide ».
 *
 * Les niveaux ne sont pas en base : ils se déduisent de l'expérience par la courbe de la config du
 * jeu. Ce dépôt rend l'expérience brute.
 */
import type { DbContext } from '../internal/context';
import { parseInput, uuidSchema } from '../internal/input';
import { toFloat, toInt } from '../internal/numbers';

export interface ProfessionProgress {
  /** Identifiant du métier (`gardener`, `fisher`, `miner`…). */
  professionId: string;
  /** Expérience cumulée. */
  xp: number;
  updatedAt: number;
}

export interface MasterySummary {
  /** `crop`, `fish`, `ore`… (le serveur de test porte aussi `creature`). */
  kind: string;
  /** Nombre de sources découvertes. */
  sources: number;
  /** Nombre total de gestes sur ces sources. */
  actions: number;
}

export interface BadgeProgress {
  count: number;
  /** Les badges gagnés, du plus récent au plus ancien. */
  earned: { badgeId: string; earnedAt: number }[];
  /** La vitrine du profil : cases 1 à 3 occupées. */
  showcase: { slot: number; badgeId: string }[];
}

export interface QuestProgress {
  /** Quêtes en cours ; `READY` : tout est fait, il reste à la rendre. */
  active: { questId: string; stage: number; status: string; startedAt: number }[];
  /** Nombre de quêtes différentes terminées au moins une fois. */
  completedQuests: number;
  /** Nombre total de fins de quête, répétitions comprises. */
  totalCompletions: number;
  /** Les quêtes terminées, de la plus récente à la plus ancienne. */
  history: { questId: string; completions: number; lastCompletedAt: number }[];
}

export interface DungeonRecord {
  dungeonId: string;
  /** `normal`, `hard` ou `nightmare`. */
  difficulty: string;
  completions: number;
  bestTimeMs: number;
  firstCompletedAt: number;
  lastCompletedAt: number;
}

export interface TowerProgress {
  towerId: string;
  /** Le plus haut palier fini (1 pour le premier). */
  highestFloor: number;
  updatedAt: number;
}

export interface DungeonProgress {
  /** Descentes menées jusqu'au boss, toutes difficultés confondues. */
  totalCompletions: number;
  records: DungeonRecord[];
  /** Vide si la table des tours n'existe pas encore (migration 2 du module). */
  towers: TowerProgress[];
}

export interface FishingProgress {
  /** Nombre total de prises. */
  totalCatches: number;
  /** Nombre d'espèces différentes pêchées. */
  species: number;
  /** Par espèce, les plus pêchées d'abord ; `maxSize` est le record de taille. */
  catches: { lootId: string; amount: number; maxSize: number }[];
}

export interface KillProgress {
  /** Créatures tuées, toutes espèces confondues. */
  total: number;
  /** Par créature, les plus tuées d'abord. */
  creatures: { creatureId: string; kills: number }[];
}

export interface CosmeticProgress {
  /** Nombre de cosmétiques possédés. */
  owned: number;
  /** Ce qui est porté, par emplacement (`BALLOON`, `HELMET`, `OFFHAND`, `BACKPACK`). */
  equipped: { slot: string; cosmeticId: string }[];
}

export interface PlayerProgression {
  professions: ProfessionProgress[] | null;
  mastery: MasterySummary[] | null;
  badges: BadgeProgress | null;
  quests: QuestProgress | null;
  dungeons: DungeonProgress | null;
  fishing: FishingProgress | null;
  kills: KillProgress | null;
  cosmetics: CosmeticProgress | null;
  /** Solde d'Éclats (`shards.balance` dans `core_player_flags`), `null` si la table manque. */
  shards: number | null;
}

export interface ProgressionRepository {
  /** Toute la progression d'un joueur. Un joueur inconnu rend des rubriques vides. */
  of(uuid: string): Promise<PlayerProgression>;
}

const SHARDS_FLAG = 'shards.balance';

export function createProgressionRepository(ctx: DbContext): ProgressionRepository {
  const { db, catalog } = ctx;

  async function professions(uuid: string): Promise<ProfessionProgress[] | null> {
    if (!(await catalog.has('professions_xp'))) return null;
    const rows = await db
      .selectFrom('professions_xp')
      .select(['profession_id', 'xp', 'updated_at'])
      .where('player_uuid', '=', uuid)
      .orderBy('xp', 'desc')
      .orderBy('profession_id')
      .execute();
    return rows.map((row) => ({
      professionId: row.profession_id,
      xp: toInt(row.xp, 'xp'),
      updatedAt: toInt(row.updated_at, 'updated_at'),
    }));
  }

  async function mastery(uuid: string): Promise<MasterySummary[] | null> {
    if (!(await catalog.has('professions_mastery'))) return null;
    const rows = await db
      .selectFrom('professions_mastery')
      .select(['kind', 'count'])
      .where('player_uuid', '=', uuid)
      .execute();
    // Agrégé ici : peu de lignes par joueur, et on évite un SUM dont le type change selon le moteur.
    const byKind = new Map<string, MasterySummary>();
    for (const row of rows) {
      const summary = byKind.get(row.kind) ?? { kind: row.kind, sources: 0, actions: 0 };
      summary.sources += 1;
      summary.actions += toInt(row.count, 'count');
      byKind.set(row.kind, summary);
    }
    return [...byKind.values()].sort((a, b) => a.kind.localeCompare(b.kind));
  }

  async function badges(uuid: string): Promise<BadgeProgress | null> {
    if (!(await catalog.has('core_badges'))) return null;
    const hasShowcase = await catalog.has('core_badge_showcase');
    const [earned, showcase] = await Promise.all([
      db
        .selectFrom('core_badges')
        .select(['badge_id', 'earned_at'])
        .where('player_uuid', '=', uuid)
        .orderBy('earned_at', 'desc')
        .orderBy('badge_id')
        .execute(),
      hasShowcase
        ? db
            .selectFrom('core_badge_showcase')
            .select(['slot', 'badge_id'])
            .where('player_uuid', '=', uuid)
            .orderBy('slot')
            .execute()
        : [],
    ]);
    return {
      count: earned.length,
      earned: earned.map((row) => ({
        badgeId: row.badge_id,
        earnedAt: toInt(row.earned_at, 'earned_at'),
      })),
      showcase: showcase.map((row) => ({ slot: toInt(row.slot, 'slot'), badgeId: row.badge_id })),
    };
  }

  async function quests(uuid: string): Promise<QuestProgress | null> {
    if (!(await catalog.has('quests_active', 'quests_history'))) return null;
    const [active, history] = await Promise.all([
      db
        .selectFrom('quests_active')
        .select(['quest_id', 'stage', 'status', 'started_at'])
        .where('player_uuid', '=', uuid)
        .orderBy('started_at', 'desc')
        .orderBy('quest_id')
        .execute(),
      db
        .selectFrom('quests_history')
        .select(['quest_id', 'completions', 'last_completed_at'])
        .where('player_uuid', '=', uuid)
        .orderBy('last_completed_at', 'desc')
        .orderBy('quest_id')
        .execute(),
    ]);
    const finished = history.map((row) => ({
      questId: row.quest_id,
      completions: toInt(row.completions, 'completions'),
      lastCompletedAt: toInt(row.last_completed_at, 'last_completed_at'),
    }));
    return {
      active: active.map((row) => ({
        questId: row.quest_id,
        stage: toInt(row.stage, 'stage'),
        status: row.status,
        startedAt: toInt(row.started_at, 'started_at'),
      })),
      completedQuests: finished.length,
      totalCompletions: finished.reduce((sum, quest) => sum + quest.completions, 0),
      history: finished,
    };
  }

  async function dungeons(uuid: string): Promise<DungeonProgress | null> {
    if (!(await catalog.has('dungeons_records'))) return null;
    const hasTowers = await catalog.has('dungeons_tower_progress');
    const [records, towers] = await Promise.all([
      db
        .selectFrom('dungeons_records')
        .select([
          'dungeon_id',
          'difficulty',
          'completions',
          'best_time_ms',
          'first_completed_at',
          'last_completed_at',
        ])
        .where('player_uuid', '=', uuid)
        .orderBy('dungeon_id')
        .orderBy('difficulty')
        .execute(),
      hasTowers
        ? db
            .selectFrom('dungeons_tower_progress')
            .select(['tower_id', 'highest_floor', 'updated_at'])
            .where('player_uuid', '=', uuid)
            .orderBy('tower_id')
            .execute()
        : [],
    ]);
    const mapped = records.map((row) => ({
      dungeonId: row.dungeon_id,
      difficulty: row.difficulty,
      completions: toInt(row.completions, 'completions'),
      bestTimeMs: toInt(row.best_time_ms, 'best_time_ms'),
      firstCompletedAt: toInt(row.first_completed_at, 'first_completed_at'),
      lastCompletedAt: toInt(row.last_completed_at, 'last_completed_at'),
    }));
    return {
      totalCompletions: mapped.reduce((sum, record) => sum + record.completions, 0),
      records: mapped,
      towers: towers.map((row) => ({
        towerId: row.tower_id,
        highestFloor: toInt(row.highest_floor, 'highest_floor'),
        updatedAt: toInt(row.updated_at, 'updated_at'),
      })),
    };
  }

  async function fishing(uuid: string): Promise<FishingProgress | null> {
    if (!(await catalog.has('core_fishing_catches'))) return null;
    const hasState = await catalog.has('core_fishing_state');
    const [catches, state] = await Promise.all([
      db
        .selectFrom('core_fishing_catches')
        .select(['loot_id', 'amount', 'max_size'])
        .where('player_uuid', '=', uuid)
        .orderBy('amount', 'desc')
        .orderBy('loot_id')
        .execute(),
      hasState
        ? db
            .selectFrom('core_fishing_state')
            .select('total')
            .where('player_uuid', '=', uuid)
            .executeTakeFirst()
        : undefined,
    ]);
    const mapped = catches.map((row) => ({
      lootId: row.loot_id,
      amount: toInt(row.amount, 'amount'),
      maxSize: toFloat(row.max_size, 'max_size'),
    }));
    return {
      // `core_fishing_state.total` fait foi ; à défaut, la somme des prises par espèce.
      totalCatches:
        state === undefined
          ? mapped.reduce((sum, entry) => sum + entry.amount, 0)
          : toInt(state.total, 'total'),
      species: mapped.length,
      catches: mapped,
    };
  }

  async function kills(uuid: string): Promise<KillProgress | null> {
    if (!(await catalog.has('entities_kills'))) return null;
    const rows = await db
      .selectFrom('entities_kills')
      .select(['creature_id', 'kills'])
      .where('player_uuid', '=', uuid)
      .orderBy('kills', 'desc')
      .orderBy('creature_id')
      .execute();
    const creatures = rows.map((row) => ({
      creatureId: row.creature_id,
      kills: toInt(row.kills, 'kills'),
    }));
    return { total: creatures.reduce((sum, creature) => sum + creature.kills, 0), creatures };
  }

  async function cosmetics(uuid: string): Promise<CosmeticProgress | null> {
    if (!(await catalog.has('core_cosmetics_owned'))) return null;
    const hasEquipped = await catalog.has('core_cosmetics_equipped');
    const [owned, equipped] = await Promise.all([
      db
        .selectFrom('core_cosmetics_owned')
        .select((eb) => eb.fn.countAll().as('total'))
        .where('player_uuid', '=', uuid)
        .executeTakeFirstOrThrow(),
      hasEquipped
        ? db
            .selectFrom('core_cosmetics_equipped')
            .select(['slot', 'cosmetic_id'])
            .where('player_uuid', '=', uuid)
            .orderBy('slot')
            .execute()
        : [],
    ]);
    return {
      owned: toInt(owned.total, 'total'),
      equipped: equipped.map((row) => ({ slot: row.slot, cosmeticId: row.cosmetic_id })),
    };
  }

  async function shards(uuid: string): Promise<number | null> {
    if (!(await catalog.has('core_player_flags'))) return null;
    const row = await db
      .selectFrom('core_player_flags')
      .select('value')
      .where('player_uuid', '=', uuid)
      .where('flag', '=', SHARDS_FLAG)
      .executeTakeFirst();
    // Ligne absente : solde nul. La valeur est du texte ; illisible, on ne l'invente pas.
    if (row === undefined) return 0;
    return /^-?\d{1,15}$/.test(row.value.trim()) ? Number(row.value.trim()) : null;
  }

  return {
    async of(uuid) {
      const id = parseInput(uuidSchema, uuid, 'UUID de joueur invalide');
      const [
        professionRows,
        masteryRows,
        badgeRows,
        questRows,
        dungeonRows,
        fishingRows,
        killRows,
        cosmeticRows,
        shardBalance,
      ] = await Promise.all([
        professions(id),
        mastery(id),
        badges(id),
        quests(id),
        dungeons(id),
        fishing(id),
        kills(id),
        cosmetics(id),
        shards(id),
      ]);
      return {
        professions: professionRows,
        mastery: masteryRows,
        badges: badgeRows,
        quests: questRows,
        dungeons: dungeonRows,
        fishing: fishingRows,
        kills: killRows,
        cosmetics: cosmeticRows,
        shards: shardBalance,
      };
    },
  };
}
