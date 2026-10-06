import type { Metadata } from 'next';
import Link from 'next/link';
import { Filter, ScrollText } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Cell,
  EmptyState,
  HeaderCell,
  PageHeader,
  PageStack,
  Row,
  Select,
  Table,
  TableBody,
  TableHead,
  buttonClass,
} from '@enderium/ui';
import { type IntentStatus, getGameDb } from '@enderium/game-db';
import { requirePermission } from '@/server/auth';
import { ListPagination, ModuleMissing } from '@/components/console/common';
import { formatDateTime } from '@/lib/format';
import { intentKindLabel, intentStatus, resultCodeLabel } from '@/lib/labels';
import { type SearchParams, choiceParam, hrefWith, pageParam } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Journal des actions' };

const STATUSES: readonly IntentStatus[] = [
  'pending',
  'running',
  'done',
  'refused',
  'failed',
  'expired',
];
const KINDS = [
  'perms.member.add',
  'perms.member.remove',
  'economy.deposit',
  'economy.withdraw',
] as const;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission('journal.read');
  const params = await searchParams;
  const db = getGameDb();

  const header = (
    <PageHeader
      title="Journal des actions"
      description="Tout ce que l’équipe a demandé au serveur depuis le site : qui, quoi, pourquoi, et ce que le serveur en a fait. Rien n’y est jamais effacé."
    />
  );

  if (!(await db.link.available())) {
    return (
      <PageStack>
        {header}
        <Card>
          <ModuleMissing module="Lien (EnderiumLink)" tables="link_intents, link_servers" />
        </Card>
      </PageStack>
    );
  }

  const status = choiceParam(params.status, STATUSES);
  const kind = choiceParam(params.kind, KINDS);
  const page = pageParam(params.page);
  const filters = { status, kind };
  const filtered = Boolean(status || kind);
  const intents = await db.link.intents.list({ status, kind, page });

  return (
    <PageStack>
      {header}
      <Card>
        <form method="GET" className="border-border flex flex-wrap items-end gap-3 border-b p-4">
          <div className="flex w-full flex-col gap-2 sm:w-48">
            <label htmlFor="journal-status" className="text-fg text-[13px] font-medium">
              État
            </label>
            <Select id="journal-status" name="status" defaultValue={status ?? ''}>
              <option value="">Tous</option>
              {STATUSES.map((choice) => (
                <option key={choice} value={choice}>
                  {intentStatus(choice).label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-56">
            <label htmlFor="journal-kind" className="text-fg text-[13px] font-medium">
              Action
            </label>
            <Select id="journal-kind" name="kind" defaultValue={kind ?? ''}>
              <option value="">Toutes</option>
              {KINDS.map((choice) => (
                <option key={choice} value={choice}>
                  {intentKindLabel(choice)}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">
            <Filter size={16} aria-hidden />
            Filtrer
          </Button>
          {filtered ? (
            <Link href="/console/journal" className={buttonClass({ variant: 'ghost' })}>
              Effacer les filtres
            </Link>
          ) : null}
        </form>

        {intents.rows.length === 0 ? (
          <EmptyState
            icon={<ScrollText size={20} aria-hidden />}
            title={filtered ? 'Aucune action ne correspond aux filtres' : 'Aucune action déposée'}
            description={
              filtered
                ? undefined
                : 'Les actions se lancent depuis la fiche d’un joueur : donner un grade, ajuster un solde.'
            }
          />
        ) : (
          <>
            <Table caption="Actions déposées par l’équipe">
              <TableHead>
                <HeaderCell>Date</HeaderCell>
                <HeaderCell>Action</HeaderCell>
                <HeaderCell>Auteur</HeaderCell>
                <HeaderCell>Motif</HeaderCell>
                <HeaderCell>État</HeaderCell>
              </TableHead>
              <TableBody>
                {intents.rows.map((intent) => {
                  const described = intentStatus(intent.status);
                  return (
                    <Row key={intent.id}>
                      <Cell className="text-fg-muted whitespace-nowrap">
                        {formatDateTime(intent.createdAt)}
                      </Cell>
                      <Cell>
                        <Link
                          href={`/console/journal/${intent.id}`}
                          className="rounded-[4px] font-medium whitespace-nowrap hover:underline"
                        >
                          {intentKindLabel(intent.kind)}
                        </Link>
                      </Cell>
                      <Cell className="whitespace-nowrap">{intent.actorName}</Cell>
                      <Cell className="text-fg-muted max-w-96 min-w-48 break-words">
                        {intent.reason}
                      </Cell>
                      <Cell>
                        <span className="flex flex-col items-start gap-1">
                          <Badge tone={described.tone}>{described.label}</Badge>
                          {intent.resultCode && intent.resultCode !== 'ok' ? (
                            <span className="text-fg-muted text-xs">
                              {resultCodeLabel(intent.resultCode)}
                            </span>
                          ) : null}
                        </span>
                      </Cell>
                    </Row>
                  );
                })}
              </TableBody>
            </Table>
            <ListPagination
              page={intents}
              hrefFor={(target) => hrefWith('/console/journal', filters, { page: target })}
            />
          </>
        )}
      </Card>
    </PageStack>
  );
}
