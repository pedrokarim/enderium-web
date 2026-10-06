import type { Metadata } from 'next';
import Link from 'next/link';
import { Filter, Flag } from 'lucide-react';
import {
  Button,
  Card,
  Cell,
  EmptyState,
  HeaderCell,
  Input,
  Notice,
  PageHeader,
  PageStack,
  Row,
  Table,
  TableBody,
  TableHead,
  buttonClass,
} from '@enderium/ui';
import { getGameDb } from '@enderium/game-db';
import { requirePermission } from '@/server/auth';
import { ListPagination, ModuleMissing, PlayerLink } from '@/components/console/common';
import { PageOutOfRange } from '@/components/console/list-states';
import { formatDateTime, plural } from '@/lib/format';
import { type SearchParams, firstParam, hrefWith, pageParam } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Signalements' };

const BASE_PATH = '/console/reports';
const UUID_PATTERN = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission('moderation.read');
  const params = await searchParams;
  const page = pageParam(params.page);
  const requestedTarget = firstParam(params.target)?.toLowerCase();
  const target =
    requestedTarget && UUID_PATTERN.test(requestedTarget) ? requestedTarget : undefined;
  const rejectedTarget = requestedTarget !== undefined && target === undefined;

  const header = (
    <PageHeader
      title="Signalements"
      description="Ce que les joueurs ont signalé en jeu, du plus récent au plus ancien."
    />
  );

  const db = getGameDb();
  // Les signalements n'ont besoin que de leur table, pas de tout le module principal.
  if (!(await db.meta.hasTable('core_reports'))) {
    return (
      <PageStack>
        {header}
        <Card>
          <ModuleMissing module="principal" tables="core_reports" />
        </Card>
      </PageStack>
    );
  }

  const reports = await db.moderation.reports({ targetUuid: target, page });
  const filters = { target };
  // Le pseudo du joueur visé n'est connu que par les lignes elles-mêmes.
  const targetName = target ? (reports.rows[0]?.targetName ?? target) : undefined;

  return (
    <PageStack>
      {header}

      {rejectedTarget ? (
        <Notice tone="warning" title="Le filtre de l’adresse a été ignoré">
          Le joueur visé doit être désigné par son UUID complet, avec ses tirets. Tous les
          signalements sont affichés.
        </Notice>
      ) : null}

      <Card>
        <form
          method="GET"
          role="search"
          className="border-border flex flex-wrap items-end gap-3 border-b p-4"
        >
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
            <label htmlFor="report-target" className="text-fg text-[13px] font-medium">
              Joueur visé
            </label>
            <Input
              id="report-target"
              type="search"
              name="target"
              defaultValue={target}
              maxLength={36}
              placeholder="UUID complet du joueur"
              autoComplete="off"
              className="font-mono"
            />
          </div>
          <Button type="submit" variant="primary">
            <Filter size={16} aria-hidden />
            Filtrer
          </Button>
          {target ? (
            <Link href={BASE_PATH} className={buttonClass({ variant: 'ghost' })}>
              Effacer
            </Link>
          ) : null}
        </form>

        {reports.total === 0 ? (
          <EmptyState
            icon={<Flag size={20} aria-hidden />}
            title={target ? 'Aucun signalement contre ce joueur' : 'Aucun signalement'}
            description={
              target ? (
                <>
                  Personne n’a signalé le joueur <span className="font-mono">{target}</span>.
                </>
              ) : (
                'Un signalement apparaît ici dès qu’un joueur en dépose un en jeu.'
              )
            }
          />
        ) : reports.rows.length === 0 ? (
          <PageOutOfRange firstPageHref={hrefWith(BASE_PATH, filters, { page: 1 })} />
        ) : (
          <>
            <p className="text-fg-muted px-4 pt-4 text-[13px]" role="status">
              {plural(reports.total, 'signalement', 'signalements')}
              {targetName ? ` contre ${targetName}` : ''}
            </p>
            <Table caption="Liste des signalements">
              <TableHead>
                <HeaderCell>Date</HeaderCell>
                <HeaderCell>Auteur</HeaderCell>
                <HeaderCell>Joueur visé</HeaderCell>
                <HeaderCell>Motif</HeaderCell>
                <HeaderCell>Lieu</HeaderCell>
                {target ? null : <HeaderCell align="right">Filtre</HeaderCell>}
              </TableHead>
              <TableBody>
                {reports.rows.map((report) => (
                  <Row key={report.id}>
                    <Cell className="text-fg-muted whitespace-nowrap">
                      {formatDateTime(report.createdAt)}
                    </Cell>
                    <Cell>
                      <PlayerLink uuid={report.reporterUuid} name={report.reporterName} />
                    </Cell>
                    <Cell>
                      <PlayerLink uuid={report.targetUuid} name={report.targetName} />
                    </Cell>
                    <Cell>
                      <span className="block max-w-96 min-w-48 font-mono text-[13px] break-all">
                        {report.reason}
                      </span>
                    </Cell>
                    <Cell className="whitespace-nowrap">
                      <span className="tabular">
                        {report.location.world} · {report.location.x}, {report.location.y},{' '}
                        {report.location.z}
                      </span>
                    </Cell>
                    {target ? null : (
                      <Cell align="right">
                        <Link
                          href={hrefWith(BASE_PATH, {}, { target: report.targetUuid })}
                          className={buttonClass({ size: 'sm', variant: 'ghost' })}
                          aria-label={`Signalements contre ${report.targetName}`}
                        >
                          Ses signalements
                        </Link>
                      </Cell>
                    )}
                  </Row>
                ))}
              </TableBody>
            </Table>
            <ListPagination
              page={reports}
              hrefFor={(next) => hrefWith(BASE_PATH, filters, { page: next })}
            />
          </>
        )}
      </Card>
    </PageStack>
  );
}
