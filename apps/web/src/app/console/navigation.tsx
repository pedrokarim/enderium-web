import {
  Coins,
  Flag,
  LayoutDashboard,
  MapPinned,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { NavSection } from '@enderium/ui';
import { can, type ConsolePermission, type ConsoleUser } from '@/server/auth';

interface GuardedItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  permission: ConsolePermission;
}

interface GuardedSection {
  label?: string;
  items: GuardedItem[];
}

/**
 * Le plan de la console. Chaque entrée porte la permission de sa page : une
 * entrée que l'utilisateur ne peut pas ouvrir n'est pas affichée (la page
 * elle-même revérifie, ce filtre n'est qu'un confort).
 */
const SECTIONS: GuardedSection[] = [
  {
    items: [
      {
        href: '/console',
        label: 'Vue d’ensemble',
        icon: <LayoutDashboard size={16} aria-hidden />,
        exact: true,
        permission: 'console.access',
      },
    ],
  },
  {
    label: 'Jeu',
    items: [
      {
        href: '/console/players',
        label: 'Joueurs',
        icon: <Users size={16} aria-hidden />,
        permission: 'players.read',
      },
      {
        href: '/console/economy',
        label: 'Économie',
        icon: <Coins size={16} aria-hidden />,
        permission: 'economy.read',
      },
      {
        href: '/console/permissions',
        label: 'Grades et permissions',
        icon: <ShieldCheck size={16} aria-hidden />,
        permission: 'permissions.read',
      },
      {
        href: '/console/regions',
        label: 'Zones',
        icon: <MapPinned size={16} aria-hidden />,
        permission: 'regions.read',
      },
    ],
  },
  {
    label: 'Équipe',
    items: [
      {
        href: '/console/reports',
        label: 'Signalements',
        icon: <Flag size={16} aria-hidden />,
        permission: 'moderation.read',
      },
      {
        href: '/console/journal',
        label: 'Journal des actions',
        icon: <ScrollText size={16} aria-hidden />,
        permission: 'journal.read',
      },
    ],
  },
];

export function navigationFor(user: ConsoleUser): NavSection[] {
  return SECTIONS.map((section) => ({
    label: section.label,
    items: section.items
      .filter((item) => can(user, item.permission))
      .map(({ href, label, icon, exact }) => ({ href, label, icon, exact })),
  })).filter((section) => section.items.length > 0);
}
