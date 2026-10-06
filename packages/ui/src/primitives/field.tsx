import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';

// Un champ est un creux dans le panneau : contour franc, biseau inversé.
const control =
  'border-line bg-surface-raised text-fg placeholder:text-fg-subtle bevel-inset w-full border-2 text-sm ' +
  'disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger pointer-coarse:min-h-11';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, 'h-9 px-3', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-20 px-3 py-2', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, 'h-9 pr-8 pl-3', className)} {...rest}>
      {children}
    </select>
  );
}

interface FieldProps {
  /** Identifiant du contrôle : relie le libellé, l'aide et l'erreur. */
  htmlFor: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Un libellé, son contrôle, une aide et une erreur. Le contrôle enfant porte
 * `id={htmlFor}` ; l'aide a l'identifiant `<htmlFor>-hint`, l'erreur
 * `<htmlFor>-error`, à citer dans son `aria-describedby`.
 */
export function Field({ htmlFor, label, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={htmlFor} className="text-fg text-[13px] font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={htmlFor + '-hint'} className="text-fg-muted text-[13px]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={htmlFor + '-error'} role="alert" className="text-danger-fg text-[13px] font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
