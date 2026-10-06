import { cn } from '../lib/cn';

interface AvatarProps {
  /** Nom dont on tire les initiales. */
  name: string;
  /** Image auto-hébergée ; absente, les initiales s'affichent. */
  src?: string | null;
  size?: 24 | 32 | 40 | 64;
  className?: string;
}

const sizes = {
  24: 'size-6 text-[11px]',
  32: 'size-8 text-[13px]',
  40: 'size-10 text-[15px]',
  64: 'size-16 text-2xl',
} as const;

function initialsOf(name: string): string {
  const letters = name.replace(/[^\p{L}\p{N}]/gu, '');
  return (letters.slice(0, 2) || '?').toUpperCase();
}

/** Vignette carrée (comme une tête de joueur). Décorative : le nom est écrit à côté. */
export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  const box = cn(
    'border-line bg-avatar text-fg-on-avatar bevel bevel-avatar font-pixel inline-flex shrink-0 items-center justify-center overflow-hidden border-2 font-medium',
    sizes[size],
    className,
  );
  if (src) {
    return <img src={src} alt="" width={size} height={size} className={box} />;
  }
  return (
    <span aria-hidden className={box}>
      {initialsOf(name)}
    </span>
  );
}
