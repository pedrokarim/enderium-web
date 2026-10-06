import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Card, CardBody, buttonClass } from '@enderium/ui';
import { SIGN_OUT_ACTION, can, getSession, isConsolePermission } from '@/server/auth';
import { CenteredPage } from '@/components/centered-page';
import { type SearchParams, firstParam } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Accès refusé' };
export const dynamic = 'force-dynamic';

export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSession();
  const requested = firstParam((await searchParams).permission);
  const permission = isConsolePermission(requested) ? requested : null;

  return (
    <CenteredPage
      title="Accès refusé"
      description={
        user
          ? `Votre compte (${user.displayName}) n’a pas le droit d’ouvrir cette page.`
          : 'Vous n’êtes pas connecté.'
      }
    >
      <Card>
        <CardBody className="flex flex-col gap-4">
          {permission ? (
            <p className="text-fg-muted text-sm">
              Droit demandé : <span className="text-fg font-mono text-[13px]">{permission}</span>.
              Les droits se donnent par les rôles de l’application Enderium, dans Ascencia ID.
            </p>
          ) : null}
          {user && can(user, 'console.access') ? (
            <Link
              href="/console"
              className={buttonClass({ variant: 'primary', className: 'w-full' })}
            >
              Revenir à la console
            </Link>
          ) : null}
          {user ? (
            <form method="POST" action={SIGN_OUT_ACTION}>
              <Button type="submit" className="w-full">
                Changer de compte
              </Button>
            </form>
          ) : (
            <Link
              href="/sign-in"
              className={buttonClass({ variant: 'primary', className: 'w-full' })}
            >
              Se connecter
            </Link>
          )}
        </CardBody>
      </Card>
    </CenteredPage>
  );
}
