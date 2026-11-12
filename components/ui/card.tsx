import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card text-card-foreground shadow-card ${className}`}>
      {children}
    </div>
  );
}
