import type { Metadata } from 'next';
import { MapPinned, ScrollText } from 'lucide-react';
import {
  Card,
  CardHeader,
  Cell,
  EmptyState,
  HeaderCell,
  PageHeader,
  PageStack,
  Row,
  Table,
  TableBody,
  TableHead,
} from '@enderium/ui';
import { getGameDb } from '@enderium/game-db';
import { requirePermission } from '@/server/auth';
import { Actor, ListPagination, ModuleMissing } from '@/components/console/common';
import { LogDetail, PageOutOfRange } from '@/components/console/list-states';
import { ZoneLink } from '@/components/console/zone-link';
import { EMPTY, formatDateTime, formatNumber, plural } from '@/lib/format';
import { regionActionLabel, regionShapeLabel } from '@/lib/labels';
import { type SearchParams, hrefWith, pageParam } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Zones' };

const BASE_PATH = '/console/regions';
/** Ancre du journal : changer de page ne renvoie pas en haut de l'écran. */
const LOG_ANCHOR = 'journal';

/** Clé d'une zone : un nom de monde ne contient pas de retour à la ligne. */
const zoneKey = (world: string, id: string) => `${world}\n${id}`;

export default async function RegionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission('regions.read');
  const page = pageParam((await searchParams).page);

  const header = (
    <PageHeader
      title="Zones"
      description="Les zones protégées de chaque monde, de la priorité la plus forte à la plus faible, et le journal de ce qui a changé."
    />
  );

  const db = getGameDb();
  if (!(await db.meta.hasModule('regions'))) {
    return (
      <PageStack>
        {header}
        <Card>
          <ModuleMissing module="Zones" tables="regions_*" />
        </Card>
      </PageStack>
    );
  }

  const [zones, log] = await Promise.all([db.regions.zones(), db.regions.log({ page })]);
  const known = new Set(zones.map((zone) => zoneKey(zone.world, zone.id)));
  const logHref = (target: number) => `${hrefWith(BASE_PATH, {}, { page: target })}#${LOG_ANCHOR}`;

  return (
    <PageStack>
      {header}

      <Card>
        <CardHeader
          title="Zones"
          description="Quand deux zones se recouvrent, la priorité la plus forte tranche."
        />
        {zones.length === 0 ? (
          <EmptyState
            icon={<MapPinned size={20} aria-hidden />}
            title="Aucune zone"
            description="Une zone apparaît ici dès qu’elle est créée en jeu."
          />
        ) : (
          <>
            <p className="text-fg-muted px-4 pt-4 text-[13px]" role="status">
              {plural(zones.length, 'zone', 'zones')}
            </p>
            <Table caption="Liste des zones, par monde puis par priorité décroissante">
              <TableHead>
                <HeaderCell>Zone</HeaderCell>
                <HeaderCell>Monde</HeaderCell>
                <HeaderCell>Forme</HeaderCell>
                <HeaderCell align="right">Priorité</HeaderCell>
                <HeaderCell>Zone parente</HeaderCell>
                <HeaderCell>Propriétaire</HeaderCell>
                <HeaderCell align="right">Drapeaux</HeaderCell>
                <HeaderCell align="right">Membres</HeaderCell>
              </TableHead>
              <TableBody>
                {zones.map((zone) => (
                  <Row key={zoneKey(zone.world, zone.id)}>
                    <Cell>
                      <ZoneLink world={zone.world} id={zone.id} />
                    </Cell>
                    <Cell className="whitespace-nowrap">{zone.world}</Cell>
                    <Cell className="whitespace-nowrap">{regionShapeLabel(zone.shape)}</Cell>
                    <Cell align="right" numeric>
                      {formatNumber(zone.priority)}
                    </Cell>
                    <Cell>
                      {zone.parentId === null ? (
                        <span className="text-fg-muted">{EMPTY}</span>
                      ) : known.has(zoneKey(zone.world, zone.parentId)) ? (
                        <ZoneLink world={zone.world} id={zone.parentId} />
                      ) : (
                        // La zone parente a disparu : son nom reste, sans fiche à ouvrir.
                        <span className="text-fg-muted break-all">{zone.parentId}</span>
                      )}
                    </Cell>
                    <Cell>
                      <Actor uuid={zone.ownerUuid} name={zone.ownerName} />
                    </Cell>
                    <Cell align="right" numeric>
                      {formatNumber(zone.flagCount)}
                    </Cell>
                    <Cell align="right" numeric>
                      {formatNumber(zone.memberCount)}
                    </Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      <div id={LOG_ANCHOR} className="scroll-mt-6">
        <Card>
          <CardHeader
            title="Journal des zones"
            description="Chaque création, suppression ou réglage de zone, du plus récent au plus ancien."
          />
          {log.total === 0 ? (
            <EmptyState
              icon={<ScrollText size={20} aria-hidden />}
              title="Le journal est vide"
              description="Une ligne s’ajoute à chaque zone créée, redéfinie ou réglée."
            />
          ) : log.rows.length === 0 ? (
            <PageOutOfRange firstPageHref={logHref(1)} />
          ) : (
            <>
              <p className="text-fg-muted px-4 pt-4 text-[13px]" role="status">
                {plural(log.total, 'ligne', 'lignes')}
              </p>
              <Table caption="Journal des zones">
                <TableHead>
                  <HeaderCell>Date</HeaderCell>
                  <HeaderCell>Action</HeaderCell>
                  <HeaderCell>Zone</HeaderCell>
                  <HeaderCell>Détail</HeaderCell>
                  <HeaderCell>Auteur</HeaderCell>
                </TableHead>
                <TableBody>
                  {log.rows.map((entry) => (
                    <Row key={entry.id}>
                      <Cell className="text-fg-muted whitespace-nowrap">
                        {formatDateTime(entry.at)}
                      </Cell>
                      <Cell className="whitespace-nowrap">{regionActionLabel(entry.action)}</Cell>
                      <Cell>
                        {known.has(zoneKey(entry.world, entry.zoneId)) ? (
                          <ZoneLink world={entry.world} id={entry.zoneId} showWorld />
                        ) : (
                          // Une zone supprimée depuis n'a plus de fiche : pas de lien.
                          <span className="flex flex-col">
                            <span className="break-all">{entry.zoneId}</span>
                            <span className="text-fg-subtle text-xs break-all">{entry.world}</span>
                          </span>
                        )}
                      </Cell>
                      <Cell>
                        <LogDetail detail={entry.detail} />
                      </Cell>
                      <Cell>
                        <Actor uuid={entry.actorUuid} name={entry.actorName} />
                      </Cell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
              <ListPagination page={log} hrefFor={logHref} />
            </>
          )}
        </Card>
      </div>
    </PageStack>
  );
}
