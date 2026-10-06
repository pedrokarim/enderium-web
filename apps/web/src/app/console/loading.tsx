/** Squelette affiché pendant la lecture de la base : il garde la place du contenu. */
export default function ConsoleLoading() {
  return (
    <div role="status" aria-label="Chargement" className="flex animate-pulse flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="rounded-field bg-surface-sunken h-7 w-56" />
        <div className="rounded-field bg-surface-sunken h-5 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} className="rounded-card border-border bg-surface h-28 border" />
        ))}
      </div>
      <div className="rounded-card border-border bg-surface h-80 border" />
    </div>
  );
}
