/** La modération : le journal des signalements (`core_reports`, en ajout seul côté jeu). */
import { z } from 'zod';

import type { DbContext } from '../internal/context';
import { parseInput, timeRangeShape, uuidSchema } from '../internal/input';
import { toInt } from '../internal/numbers';
import { emptyPage, offsetOf, pageShape, toPage, type Page, type PageInput } from '../pagination';
import { lookupPlayerNames } from '../players/names';

export interface Report {
  id: number;
  createdAt: number;
  reporterUuid: string;
  /** Pseudo de l'auteur : l'actuel s'il est connu, sinon celui du moment du signalement. */
  reporterName: string;
  targetUuid: string;
  targetName: string;
  /** Motif choisi : une clé de traduction du jeu. */
  reason: string;
  /** Où se trouvait l'auteur. */
  location: { world: string; x: number; y: number; z: number };
}

export interface ReportsInput extends PageInput {
  /** Signalements reçus par ce joueur. */
  targetUuid?: string | undefined;
  /** Signalements déposés par ce joueur. */
  reporterUuid?: string | undefined;
  from?: number | undefined;
  to?: number | undefined;
}

export interface ReportCounts {
  /** Signalements reçus. */
  received: number;
  /** Signalements déposés. */
  filed: number;
}

export interface ModerationRepository {
  /** Les signalements, du plus récent au plus ancien. */
  reports(input?: ReportsInput): Promise<Page<Report>>;
  /** Combien de signalements un joueur a reçus et déposés. */
  reportCountsOf(uuid: string): Promise<ReportCounts>;
}

const reportsSchema = z.object({
  ...pageShape,
  ...timeRangeShape,
  targetUuid: uuidSchema.optional(),
  reporterUuid: uuidSchema.optional(),
});

export function createModerationRepository(ctx: DbContext): ModerationRepository {
  const available = () => ctx.catalog.has('core_reports');

  return {
    async reports(input = {}) {
      const query = parseInput(reportsSchema, input, 'Filtre des signalements invalide');
      if (!(await available())) return emptyPage(query);

      const { targetUuid, reporterUuid, from, to } = query;
      const filtered = ctx.db
        .selectFrom('core_reports')
        .$if(targetUuid !== undefined, (qb) => qb.where('target_uuid', '=', targetUuid as string))
        .$if(reporterUuid !== undefined, (qb) =>
          qb.where('reporter_uuid', '=', reporterUuid as string),
        )
        .$if(from !== undefined, (qb) => qb.where('created_at', '>=', from as number))
        .$if(to !== undefined, (qb) => qb.where('created_at', '<', to as number));

      const [rows, counted] = await Promise.all([
        filtered
          .select([
            'id',
            'created_at',
            'reporter_uuid',
            'reporter_name',
            'target_uuid',
            'target_name',
            'reason',
            'world',
            'x',
            'y',
            'z',
          ])
          .orderBy('created_at', 'desc')
          .orderBy('id', 'desc')
          .limit(query.pageSize)
          .offset(offsetOf(query))
          .execute(),
        filtered.select((eb) => eb.fn.countAll().as('total')).executeTakeFirstOrThrow(),
      ]);

      const names = await lookupPlayerNames(
        ctx,
        rows.flatMap((row) => [row.reporter_uuid, row.target_uuid]),
      );
      const reports = rows.map((row): Report => ({
        id: toInt(row.id, 'id'),
        createdAt: toInt(row.created_at, 'created_at'),
        reporterUuid: row.reporter_uuid,
        reporterName: names.get(row.reporter_uuid) ?? row.reporter_name,
        targetUuid: row.target_uuid,
        targetName: names.get(row.target_uuid) ?? row.target_name,
        reason: row.reason,
        location: {
          world: row.world,
          x: toInt(row.x, 'x'),
          y: toInt(row.y, 'y'),
          z: toInt(row.z, 'z'),
        },
      }));
      return toPage(reports, toInt(counted.total, 'total'), query);
    },

    async reportCountsOf(uuid) {
      const id = parseInput(uuidSchema, uuid, 'UUID de joueur invalide');
      if (!(await available())) return { received: 0, filed: 0 };
      const [received, filed] = await Promise.all([
        ctx.db
          .selectFrom('core_reports')
          .select((eb) => eb.fn.countAll().as('total'))
          .where('target_uuid', '=', id)
          .executeTakeFirstOrThrow(),
        ctx.db
          .selectFrom('core_reports')
          .select((eb) => eb.fn.countAll().as('total'))
          .where('reporter_uuid', '=', id)
          .executeTakeFirstOrThrow(),
      ]);
      return { received: toInt(received.total, 'total'), filed: toInt(filed.total, 'total') };
    },
  };
}
