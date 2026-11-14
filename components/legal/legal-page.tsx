import type { ReactNode } from "react";

/** Mise en page commune des pages légales : titre, date, sections. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-6 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{updated}</p>
      {intro && <p className="mt-6 text-muted-foreground">{intro}</p>}
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}
