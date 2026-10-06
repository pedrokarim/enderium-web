/**
 * `@enderium/game-db` : le seul endroit du site qui parle à la base d'Enderium.
 *
 * Lecture seule, à une exception près : `link.intents.enqueue` insère une intention, que le
 * serveur de jeu exécute (`docs/contracts/intents.md`).
 */
export { DB_URL_ENV, createGameDb, getGameDb, resetGameDb } from './client';
export type { GameDb, GameDbOptions } from './client';

export { engineOf } from './dialects';
export type { Engine } from './dialects';

export {
  GameDbConfigError,
  GameDbError,
  InvalidInputError,
  InvalidIntentError,
  LinkUnavailableError,
  UnsafeIntegerError,
} from './errors';
export type { InputIssue, LinkUnavailableReason } from './errors';

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './pagination';
export type { Page, PageInput } from './pagination';

export { MODULES, MODULE_IDS, isModuleId } from './meta/modules';
export type { ModuleId } from './meta/modules';
export type { MetaRepository, ModuleStatus, SchemaMigration } from './meta/repository';

export type {
  OnlineEstimate,
  PlayerDetail,
  PlayerGroupBadge,
  PlayerListInput,
  PlayerLocation,
  PlayerSort,
  PlayerSummary,
  PlayersRepository,
} from './players/repository';

export type {
  BalanceRank,
  DailyFlow,
  DailySeriesInput,
  EconomyAccount,
  EconomyOverview,
  EconomyRepository,
  KindFlow,
  LedgerEntry,
  LedgerInput,
  LedgerMovement,
  TimeRangeInput,
} from './economy/repository';

export type {
  GroupMember,
  InheritedPermissionNode,
  Membership,
  PermissionGroup,
  PermissionGroupDetail,
  PermissionLogEntry,
  PermissionLogInput,
  PermissionNode,
  PermissionsRepository,
  PlayerPermissionOverrides,
} from './permissions/repository';

export type {
  RegionLogEntry,
  RegionLogInput,
  RegionsRepository,
  Zone,
  ZoneBounds,
  ZoneDetail,
  ZoneFlag,
  ZoneMember,
  ZonePoint,
} from './regions/repository';

export type {
  ModerationRepository,
  Report,
  ReportCounts,
  ReportsInput,
} from './moderation/repository';

export type {
  BadgeProgress,
  CosmeticProgress,
  DungeonProgress,
  DungeonRecord,
  FishingProgress,
  KillProgress,
  MasterySummary,
  PlayerProgression,
  ProfessionProgress,
  ProgressionRepository,
  QuestProgress,
  TowerProgress,
} from './progression/repository';

export {
  DEFAULT_INTENT_TTL_MS,
  LINK_SECRET_ENV,
  MIN_LINK_SECRET_BYTES,
  SERVER_ONLINE_WINDOW_MS,
} from './link/constants';
export { INTENT_STATUSES } from './link/repository';
export type {
  EnqueueIntentInput,
  EnqueueIntentOptions,
  EnqueueIntentResult,
  Intent,
  IntentEnvelope,
  IntentListInput,
  IntentStatus,
  LinkRepository,
  LinkStatus,
  ServerHeartbeat,
} from './link/repository';

export {
  INTENT_KINDS,
  INTENT_PAYLOAD_SCHEMAS,
  isIntentKind,
  serializeIntentPayload,
} from './intents/kinds';
export type { IntentKind, IntentPayloads, SerializedPayload } from './intents/kinds';
export { intentSigningMessage, signIntent, verifyIntentSignature } from './intents/signature';
export type { IntentSignatureFields } from './intents/signature';

export type { Database, TableName } from './schema';
