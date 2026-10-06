import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { Avatar, Button, ConsoleShell } from '@enderium/ui';
import { SIGN_OUT_ACTION, requirePermission } from '@/server/auth';
import { ServerStatus, loadLinkSnapshot } from '@/components/console/server-status';
import { ThemeToggle } from '@/components/theme-toggle';
import { navigationFor } from './navigation';

export const metadata: Metadata = {
  title: { default: 'Console', template: '%s · Console Enderium' },
};

// La console montre l'état vivant du serveur : rien n'y est mis en cache.
export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const user = await requirePermission('console.access');
  const snapshot = await loadLinkSnapshot();

  return (
    <ConsoleShell
      brand={{ name: 'Enderium', tagline: 'Console d’équipe', href: '/console' }}
      sections={navigationFor(user)}
      labels={{
        navigation: 'Navigation de la console',
        openMenu: 'Ouvrir le menu',
        closeMenu: 'Fermer le menu',
        skipToContent: 'Aller au contenu',
      }}
      topbar={
        <>
          <ServerStatus snapshot={snapshot} />
          <ThemeToggle />
        </>
      }
      sidebarFooter={
        <div className="flex items-center gap-3">
          <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-pixel text-chrome-fg truncate text-[15px] font-medium">
              {user.displayName}
            </span>
            <span className="text-chrome-fg-muted truncate text-xs">
              {user.roles.length > 0 ? user.roles.join(', ') : 'Aucun rôle'}
            </span>
          </div>
          {/* Vrai formulaire POST : la déconnexion marche sans JavaScript. */}
          <form method="POST" action={SIGN_OUT_ACTION}>
            <Button type="submit" variant="chrome" size="sm" iconOnly aria-label="Se déconnecter">
              <LogOut size={16} aria-hidden />
            </Button>
          </form>
        </div>
      }
    >
      {children}
    </ConsoleShell>
  );
}
