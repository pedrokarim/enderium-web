import { cn } from '../lib/cn';

interface LogoMarkProps {
  /** Côté du carré, en pixels. */
  size?: number;
  /** Nom lu par un lecteur d'écran ; absent, la marque est décorative. */
  title?: string;
  className?: string;
}

/**
 * La marque d'Enderium : le « E » en pixels dans son cadre, dessiné sur une
 * grille de 16 pour rester net à toutes les tailles.
 */
export function LogoMark({ size = 28, title, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn('shrink-0', className)}
    >
      <rect width="16" height="16" rx="3" fill="#1a1f3a" />
      <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="#3d4585" />
      <path d="M5 4h6v2H7v1h3v2H7v1h4v2H5z" fill="#aeabff" />
      <path d="M5 4h6v1H6v7H5z" fill="#d2d0ff" />
    </svg>
  );
}
