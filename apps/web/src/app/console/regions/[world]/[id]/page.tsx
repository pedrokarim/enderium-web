import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Flag, Users } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Cell,
  DescriptionList,
  EmptyState,
  HeaderCell,
  PageHeader,
  PageStack,
  Row,
  StatGrid,
  StatTile,
  Table,
  TableBody,
  TableHead,
} from '@enderium/ui';
import { getGameDb, type ZoneMember } from '@enderium/game-db';
import { can, requirePermission } from '@/server/auth';
import { Actor, GroupChip, ModuleMissing, PlayerLink } from '@/components/console/common';
import { ZoneLink } from '@/components/console/zone-link';
import { EMPTY, formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { flagValue, regionShapeLabel, zoneMemberTypeLabel, zoneRoleLabel } from '@/lib/labels';
import { segmentParam } from '@/lib/route-params';

/** Un nom de monde ou un identifiant de zone : lettres, chiffres, `_ . : -`. */
const SEGMENT_PATTERN = /^[\w.:-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const CRUMBS_ROOT = { label: 'Zones', href: '/console/regions' };

interface Props {
  params: Promise<{ world: string; id: string }>;
}

/** Les deux segments validés, ou `null` si l'un d'eux est mal formé. */
async function readSegments(
  params: Props['params'],
): Promise<{ world: string; id: string } | null> {
  const raw = await params;
  const world = segmentParam(raw.world, SEGMENT_PATTERN);
  const id = segmentParam(raw.id, SEGMENT_PATTERN);
  return world && id ? { world, id } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requirePermission('regions.read');
  const segments = await readSegments(params);
  if (!segments) return { title: 'Zone introuvable' };
  const zone = await getGameDb().regions.zone(segments.world, segments.id);
  return { title: zone ? `Zone ${zone.id}` : 'Zone introuvable' };
}

/** Un membre de zone : un joueur, un grade, ou un collectif désigné par son identifiant. */
function MemberIdentity({ member, linkGroups }: { member: ZoneMember; linkGroups: boolean }) {
  if (member.type === 'player' && UUID_PATTERN.test(member.id)) {
    return <PlayerLink uuid={member.id} name={member.name} showUuid />;
  }
  if (member.type === 'group') return <GroupChip id={member.id} href={linkGroups} />;
  return <span className="font-mono text-[13px] break-all">{member.id}</span>;
}

export default async function ZonePage({ params }: Props) {
  const user = await requirePermission('regions.read');
  const segments = await readSegments(params);
  if (!segments) notFound();

  const db = getGameDb();
  if (!(await db.meta.hasModule('regions'))) {
    return (
      <PageStack>
        <PageHeader
          crumbsLabel="Fil d’Ariane"
          crumbs={[CRUMBS_ROOT, { label: segments.id }]}
          title={segments.id}
        />
        <Card>
          <ModuleMissing module="Zones" tables="regions_*" />
        </Card>
      </PageStack>
    );
  }

  const zone = await db.regions.zone(segments.world, segments.id);
  if (!zone) notFound();

  // Une zone de forme `chunk` compte ses points en chunks, les autres en blocs.
  const unit = zone.shape === 'chunk' ? 'chunks' : 'blocs';
  const bounds = zone.bounds;
  const linkGroups = can(user, 'permissions.read');

  return (
    <PageStack>
      <PageHeader
        crumbsLabel="Fil d’Ariane"
        crumbs={[CRUMBS_ROOT, { label: zone.id }]}
        title={zone.id}
        meta={
          <>
            <Badge>{zone.world}</Badge>
            <Badge tone="info">{regionShapeLabel(zone.shape)}</Badge>
          </>
        }
        description="Le contour de la zone, ses drapeaux, ses membres et les zones qui en héritent."
      />

      <StatGrid>
        <StatTile
          label="Priorité"
          value={formatNumber(zone.priority)}
          hint="La plus forte tranche la première"
        />
        <StatTile
          label="Drapeaux"
          value={formatNumber(zone.flagCount)}
          icon={<Flag size={16} aria-hidden />}
        />
        <StatTile
          label="Membres"
          value={formatNumber(zone.memberCount)}
          icon={<Users size={16} aria-hidden />}
        />
        <StatTile label="Zones enfants" value={formatNumber(zone.children.length)} />
      </StatGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Contour" />
          <CardBody>
            <DescriptionList
              columns={2}
              items={[
                { label: 'Monde', value: zone.world },
                { label: 'Forme', value: regionShapeLabel(zone.shape) },
                {
                  label: `Est-ouest (X, en ${unit})`,
                  value: bounds ? (
                    <span className="tabular">
                      de {bounds.minX} à {bounds.maxX}
                    </span>
                  ) : (
                    EMPTY
                  ),
                },
                {
                  label: `Nord-sud (Z, en ${unit})`,
                  value: bounds ? (
                    <span className="tabular">
                      de {bounds.minZ} à {bounds.maxZ}
                    </span>
                  ) : (
                    EMPTY
                  ),
                },
                {
                  label: 'Hauteur (Y, en blocs)',
                  value: bounds ? (
                    <span className="tabular">
                      de {bounds.minY} à {bounds.maxY}
                    </span>
                  ) : (
                    EMPTY
                  ),
                },
                {
                  label: 'Emprise',
                  value: bounds ? (
                    <span className="tabular">
                      {formatNumber(bounds.maxX - bounds.minX + 1)} ×{' '}
                      {formatNumber(bounds.maxZ - bounds.minZ + 1)} {unit}, sur{' '}
                      {formatNumber(bounds.maxY - bounds.minY + 1)} blocs de haut
                    </span>
                  ) : zone.shape === 'global' ? (
                    'Le monde entier'
                  ) : (
                    EMPTY
                  ),
                },
                {
                  label: 'Zone parente',
                  value: zone.parentId ? (
                    <ZoneLink world={zone.world} id={zone.parentId} />
                  ) : (
                    <span className="text-fg-muted">Aucune</span>
                  ),
                },
                {
                  label: 'Propriétaire',
                  value: <Actor uuid={zone.ownerUuid} name={zone.ownerName} />,
                },
                { label: 'Créée le', value: formatDateTime(zone.createdAt) },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Points du contour"
            description={`Coordonnées X et Z en ${unit}, hauteurs en blocs.`}
          />
          {zone.points.length === 0 ? (
            <EmptyState
              title="Aucun point"
              description={
                zone.shape === 'global'
                  ? 'Cette zone n’a pas de contour tracé : elle couvre tout son monde.'
                  : 'La base ne contient aucun point pour cette zone.'
              }
            />
          ) : (
            <Table caption={`Points du contour de la zone ${zone.id}`}>
              <TableHead>
                <HeaderCell align="right">Point</HeaderCell>
                <HeaderCell align="right">X</HeaderCell>
                <HeaderCell align="right">Z</HeaderCell>
                <HeaderCell align="right">Y le plus bas</HeaderCell>
                <HeaderCell align="right">Y le plus haut</HeaderCell>
              </TableHead>
              <TableBody>
                {zone.points.map((point) => (
                  <Row key={point.ordinal}>
                    <Cell align="right" numeric className="text-fg-muted">
                      {point.ordinal + 1}
                    </Cell>
                    <Cell align="right" numeric>
                      {point.x}
                    </Cell>
                    <Cell align="right" numeric>
                      {point.z}
                    </Cell>
                    <Cell align="right" numeric>
                      {point.yMin}
                    </Cell>
                    <Cell align="right" numeric>
                      {point.yMax}
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
          title="Drapeaux"
          description="Un drapeau absent n’est pas refusé : il n’est pas tranché ici, la zone parente ou le monde décide."
        />
        {zone.flags.length === 0 ? (
          <EmptyState
            icon={<Flag size={20} aria-hidden />}
            title="Aucun drapeau"
            description="Cette zone ne tranche aucune règle elle-même."
          />
        ) : (
          <Table caption={`Drapeaux de la zone ${zone.id}`}>
            <TableHead>
              <HeaderCell>Drapeau</HeaderCell>
              <HeaderCell>Valeur</HeaderCell>
              <HeaderCell>Posé par</HeaderCell>
              <HeaderCell>Posé le</HeaderCell>
            </TableHead>
            <TableBody>
              {zone.flags.map((flag) => {
                const described = flagValue(flag.value);
                return (
                  <Row key={flag.flag}>
                    <Cell>
                      <span className="block max-w-96 font-mono text-[13px] break-all">
                        {flag.flag}
                      </span>
                    </Cell>
                    <Cell>
                      {described.tone === 'neutral' ? (
                        // Valeur libre (rôle, clé de traduction, expression) : elle peut être longue.
                        <span className="block max-w-96 min-w-24 font-mono text-[13px] break-all">
                          {flag.value}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <Badge tone={described.tone}>{described.label}</Badge>
                          <span className="text-fg-muted font-mono text-[13px]">{flag.value}</span>
                        </span>
                      )}
                    </Cell>
                    <Cell>
                      <Actor uuid={flag.setBy} name={flag.setByName} />
                    </Cell>
                    <Cell className="text-fg-muted whitespace-nowrap">
                      {formatDateTime(flag.setAt)}
                    </Cell>
                  </Row>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Membres et rôles" />
          {zone.members.length === 0 ? (
            <EmptyState
              icon={<Users size={20} aria-hidden />}
              title="Aucun membre"
              description="Personne n’a de rôle dans cette zone : seuls ses drapeaux s’y appliquent."
            />
          ) : (
            <Table caption={`Membres de la zone ${zone.id}`}>
              <TableHead>
                <HeaderCell>Membre</HeaderCell>
                <HeaderCell>Nature</HeaderCell>
                <HeaderCell>Rôle</HeaderCell>
                <HeaderCell>Ajouté le</HeaderCell>
              </TableHead>
              <TableBody>
                {zone.members.map((member) => (
                  <Row key={`${member.type}:${member.id}`}>
                    <Cell>
                      <MemberIdentity member={member} linkGroups={linkGroups} />
                    </Cell>
                    <Cell className="text-fg-muted whitespace-nowrap">
                      {zoneMemberTypeLabel(member.type)}
                    </Cell>
                    <Cell>
                      <Badge>{zoneRoleLabel(member.role)}</Badge>
                    </Cell>
                    <Cell className="text-fg-muted whitespace-nowrap">
                      {formatDate(member.addedAt)}
                    </Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Zones enfants"
            description="Elles héritent d’ici les drapeaux qu’elles ne tranchent pas."
          />
          {zone.children.length === 0 ? (
            <EmptyState
              title="Aucune zone enfant"
              description="Aucune zone de ce monde n’hérite de celle-ci."
            />
          ) : (
            <CardBody>
              <ul className="flex flex-col gap-2 text-sm">
                {zone.children.map((child) => (
                  <li key={child}>
                    <ZoneLink world={zone.world} id={child} />
                  </li>
                ))}
              </ul>
            </CardBody>
          )}
        </Card>
      </div>
    </PageStack>
  );
}
