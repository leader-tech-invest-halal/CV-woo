// Silhouette affichée pendant le chargement du tableau de bord (compteur lu dans la base)
export default function Loading() {
  const bar = "animate-pulse rounded-md bg-muted";
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
        <div className={`${bar} h-7 w-48`} />
        <div className={`${bar} mt-3 h-4 w-72 max-w-full`} />
        <div className={`${bar} mt-6 h-11 w-64 max-w-full`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <div className={`${bar} h-48`} />
          <div className={`${bar} h-40`} />
        </div>
        <div className={`${bar} h-36`} />
      </div>
    </div>
  );
}
