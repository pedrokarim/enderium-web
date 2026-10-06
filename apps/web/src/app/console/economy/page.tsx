import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Filter } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Cell,
  EmptyState,
  HeaderCell,
  PageHeader,
  PageStack,
  Row,
  Select,
  StatGrid,
  StatTile,
  Table,
  TableBody,
  TableHead,
  buttonClass,
} from '@enderium/ui';
import { type LedgerEntry, type LedgerMovement, getGameDb } from '@enderium/game-db';
import { requirePermission } from '@/server/auth';
import { ListPagination, ModuleMissing, PlayerLink } from '@/components/console/common';
import { DailyFlowChart } from '@/components/console/daily-flow-chart';
import {
  EMPTY,
  daysAgo,
  formatCoins,
  formatCompact,
  formatDateTime,
  formatNumber,
  formatSignedCoins,
} from '@/lib/format';
import { ledgerKindLabel } from '@/lib/labels';
import {
  type SearchParams,
  choiceParam,
  firstParam,
  hrefWith,
  pageParam,
} from '@/lib/search-params';

export const metadata: Metadata = { title: 'Économie' };

const UUID_PATTERN = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const KIND_PATTERN = /^[a-z0-9_.-]{1,24}$/;
const MOVEMENTS: readonly LedgerMovement[] = ['creation', 'destruction', 'transfer'];
const MOVEMENT_LABELS: Record<LedgerMovement, string> = {
  creation: 'Création',
  destruction: 'Destruction',
  transfer: 'Transfert',
};

const SERIES_DAYS = 30;
const dayLabel = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const fullDayLabel = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'UTC' });

/** Le plus petit « nombre rond » au-dessus du maximum : 1, 2 ou 5 fois une puissance de dix. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= value) ?? 10;
  return step * magnitude;
}

/**
 * Le ou les comptes d'un mouvement : celui qui reçoit une création, celui qui
 * paie une destruction, les deux pour un transfert.
 */
function LedgerAccounts({ entry }: { entry: LedgerEntry }) {
  const source = entry.sourceUuid ? (
    <PlayerLink uuid={entry.sourceUuid} name={entry.sourceName} />
  ) : null;
  const target = entry.targetUuid ? (
    <PlayerLink uuid={entry.targetUuid} name={entry.targetName} />
  ) : null;
  if (source && target) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {source}
        <ArrowRight size={14} aria-label="vers" className="text-fg-subtle" />
        {target}
      </span>
    );
  }
  return source ?? target ?? <span className="text-fg-muted">{EMPTY}</span>;
}

export default async function EconomyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission('economy.read');
  const params = await searchParams;
  const db = getGameDb();

  if (!(await db.meta.hasModule('economy'))) {
    return (
      <PageStack>
        <PageHeader title="Économie" />
        <Card>
          <ModuleMissing module="Économie" tables="economy_accounts, economy_ledger" />
        </Card>
      </PageStack>
    );
  }

  const kindParam = firstParam(params.kind);
  const kind = kindParam && KIND_PATTERN.test(kindParam) ? kindParam : undefined;
  const playerParam = firstParam(params.player)?.toLowerCase();
  const playerUuid = playerParam && UUID_PATTERN.test(playerParam) ? playerParam : undefined;
  const movement = choiceParam(params.movement, MOVEMENTS);
  const page = pageParam(params.page);
  const filters = { kind, player: playerUuid, movement };
  const filtered = Boolean(kind || playerUuid || movement);

  const since = daysAgo(SERIES_DAYS);
  const [overview, series, flows, top, kinds, ledger, filteredPlayer] = await Promise.all([
    db.economy.overview(),
    db.economy.dailySeries(),
    db.economy.flowsByKind({ from: since }),
    db.economy.topBalances(8),
    db.economy.kinds(),
    db.economy.ledger({ kind, playerUuid, movement, page }),
    playerUuid ? db.players.get(playerUuid) : Promise.resolve(null),
  ]);

  const created = series.reduce((sum, day) => sum + day.created, 0);
  const destroyed = series.reduce((sum, day) => sum + day.destroyed, 0);
  const top3 = top.slice(0, 3).reduce((sum, account) => sum + account.balance, 0);
  const ceiling = niceCeiling(Math.max(...series.map((d) => Math.max(d.created, d.destroyed)), 0));
  const hasFlows = created > 0 || destroyed > 0;

  return (
    <PageStack>
      <PageHeader
        title="Économie"
        description="La monnaie en circulation, ce qui la crée et ce qui la détruit. Tout vient du journal des mouvements, en ajout seul."
      />

      <StatGrid>
        <StatTile
          label="Masse monétaire"
          value={overview ? formatCoins(overview.moneySupply) : EMPTY}
          hint={overview ? `${formatNumber(overview.accounts)} comptes` : undefined}
        />
        <StatTile
          label={`Créées en ${SERIES_DAYS} jours`}
          value={formatCoins(created)}
          hint="Primes, récompenses, ventes au serveur"
        />
        <StatTile
          label={`Détruites en ${SERIES_DAYS} jours`}
          value={formatCoins(destroyed)}
          hint="Achats au serveur, commissions"
        />
        <StatTile
          label="Solde médian"
          value={overview ? formatCoins(overview.medianBalance) : EMPTY}
          hint={
            overview && overview.moneySupply > 0
              ? `Les 3 premières fortunes tiennent ${Math.round((top3 / overview.moneySupply) * 100)} % de la masse`
              : undefined
          }
        />
      </StatGrid>

      <Card>
        <CardHeader
          title="Créations et destructions par jour"
          description={`Les ${SERIES_DAYS} derniers jours, en pièces.`}
        />
        {hasFlows ? (
          <CardBody className="flex flex-col gap-4">
            <DailyFlowChart
              labels={{ created: 'Créées', destroyed: 'Détruites' }}
              ticks={[ceiling, ceiling / 2, 0].map((value) => ({
                value,
                text: formatCompact(value),
              }))}
              points={series.map((day) => {
                const date = new Date(`${day.day}T00:00:00Z`);
                return {
                  label: dayLabel.format(date),
                  fullLabel: fullDayLabel.format(date),
                  created: day.created,
                  destroyed: day.destroyed,
                  createdText: formatNumber(day.created),
                  destroyedText: formatNumber(day.destroyed),
                };
              })}
            />
            <details className="text-[13px]">
              <summary className="text-fg-muted hover:text-fg w-fit cursor-pointer rounded-[4px]">
                Voir les chiffres par jour
              </summary>
              <Table caption="Pièces créées et détruites par jour" className="pt-3">
                <TableHead>
                  <HeaderCell>Jour</HeaderCell>
                  <HeaderCell align="right">Créées</HeaderCell>
                  <HeaderCell align="right">Détruites</HeaderCell>
                  <HeaderCell align="right">Variation</HeaderCell>
                </TableHead>
                <TableBody>
                  {series
                    .filter((day) => day.entries > 0)
                    .toReversed()
                    .map((day) => (
                      <Row key={day.day}>
                        <Cell className="whitespace-nowrap">
                          {fullDayLabel.format(new Date(`${day.day}T00:00:00Z`))}
                        </Cell>
                        <Cell align="right" numeric>
                          {formatNumber(day.created)}
                        </Cell>
                        <Cell align="right" numeric>
                          {formatNumber(day.destroyed)}
                        </Cell>
                        <Cell align="right" numeric>
                          {formatSignedCoins(day.net)}
                        </Cell>
                      </Row>
                    ))}
                </TableBody>
              </Table>
            </details>
          </CardBody>
        ) : (
          <EmptyState
            title="Aucun mouvement sur la période"
            description="Le graphique apparaît dès qu’une pièce est créée ou détruite."
          />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Sources et puits"
            description={`Par nature de mouvement, sur ${SERIES_DAYS} jours.`}
          />
          {flows.length === 0 ? (
            <EmptyState title="Aucun mouvement sur la période" />
          ) : (
            <Table caption="Pièces créées, détruites et transférées par nature de mouvement">
              <TableHead>
                <HeaderCell>Nature</HeaderCell>
                <HeaderCell align="right">Créées</HeaderCell>
                <HeaderCell align="right">Détruites</HeaderCell>
                <HeaderCell align="right">Transférées</HeaderCell>
                <HeaderCell align="right">Mouvements</HeaderCell>
              </TableHead>
              <TableBody>
                {flows.map((flow) => (
                  <Row key={flow.kind}>
                    <Cell>
                      <Link
                        href={hrefWith('/console/economy', { kind: flow.kind })}
                        className="rounded-[4px] hover:underline"
                      >
                        {ledgerKindLabel(flow.kind)}
                      </Link>
                    </Cell>
                    <Cell align="right" numeric>
                      {flow.created > 0 ? formatNumber(flow.created) : EMPTY}
                    </Cell>
                    <Cell align="right" numeric>
                      {flow.destroyed > 0 ? formatNumber(flow.destroyed) : EMPTY}
                    </Cell>
                    <Cell align="right" numeric>
                      {flow.transferred > 0 ? formatNumber(flow.transferred) : EMPTY}
                    </Cell>
                    <Cell align="right" numeric>
                      {formatNumber(flow.entries)}
                    </Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Premières fortunes" />
          {top.length === 0 ? (
            <EmptyState title="Aucun compte" />
          ) : (
            <Table caption="Les plus gros soldes du serveur">
              <TableHead>
                <HeaderCell align="right">Rang</HeaderCell>
                <HeaderCell>Joueur</HeaderCell>
                <HeaderCell align="right">Solde</HeaderCell>
              </TableHead>
              <TableBody>
                {top.map((account) => (
                  <Row key={account.uuid}>
                    <Cell align="right" numeric className="text-fg-muted w-16">
                      {account.rank}
                    </Cell>
                    <Cell>
                      <PlayerLink uuid={account.uuid} name={account.name} />
                    </Cell>
                    <Cell align="right" numeric>
                      {formatCoins(account.balance)}
                    </Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Journal des mouvements"
          description={
            playerUuid
              ? `Mouvements de ${filteredPlayer?.name ?? playerUuid}.`
              : 'Du plus récent au plus ancien.'
          }
        />
        <form method="GET" className="border-border flex flex-wrap items-end gap-3 border-b p-4">
          {playerUuid ? <input type="hidden" name="player" value={playerUuid} /> : null}
          <div className="flex w-full flex-col gap-2 sm:w-64">
            <label htmlFor="ledger-kind" className="text-fg text-[13px] font-medium">
              Nature
            </label>
            <Select id="ledger-kind" name="kind" defaultValue={kind ?? ''}>
              <option value="">Toutes</option>
              {kinds.map((choice) => (
                <option key={choice} value={choice}>
                  {ledgerKindLabel(choice)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-48">
            <label htmlFor="ledger-movement" className="text-fg text-[13px] font-medium">
              Sens
            </label>
            <Select id="ledger-movement" name="movement" defaultValue={movement ?? ''}>
              <option value="">Tous</option>
              {MOVEMENTS.map((choice) => (
                <option key={choice} value={choice}>
                  {MOVEMENT_LABELS[choice]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">
            <Filter size={16} aria-hidden />
            Filtrer
          </Button>
          {filtered ? (
            <Link href="/console/economy" className={buttonClass({ variant: 'ghost' })}>
              Effacer les filtres
            </Link>
          ) : null}
        </form>

        {ledger.rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'Aucun mouvement ne correspond aux filtres' : 'Aucun mouvement'}
          />
        ) : (
          <>
            <Table caption="Journal des mouvements d’argent">
              <TableHead>
                <HeaderCell>Date</HeaderCell>
                <HeaderCell>Nature</HeaderCell>
                <HeaderCell>Compte</HeaderCell>
                <HeaderCell align="right">Montant</HeaderCell>
              </TableHead>
              <TableBody>
                {ledger.rows.map((entry) => (
                  <Row key={entry.id}>
                    <Cell className="text-fg-muted whitespace-nowrap">
                      {formatDateTime(entry.at)}
                    </Cell>
                    <Cell>
                      <span className="flex min-w-40 flex-col">
                        <span>{ledgerKindLabel(entry.kind)}</span>
                        {entry.reason ? (
                          <span className="text-fg-muted text-xs break-words">{entry.reason}</span>
                        ) : null}
                      </span>
                    </Cell>
                    <Cell>
                      <LedgerAccounts entry={entry} />
                    </Cell>
                    <Cell align="right" numeric>
                      <span className="flex flex-col items-end">
                        <span>
                          {entry.movement === 'transfer'
                            ? formatNumber(entry.amount)
                            : formatSignedCoins(
                                entry.movement === 'creation' ? entry.amount : -entry.amount,
                              )}
                        </span>
                        <span className="text-fg-muted text-xs">
                          {MOVEMENT_LABELS[entry.movement]}
                        </span>
                      </span>
                    </Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
            <ListPagination
              page={ledger}
              hrefFor={(target) => hrefWith('/console/economy', filters, { page: target })}
            />
          </>
        )}
      </Card>
    </PageStack>
  );
}
