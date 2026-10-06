type ClassValue = string | false | null | undefined;

/** Assemble des classes en ignorant les valeurs vides. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
