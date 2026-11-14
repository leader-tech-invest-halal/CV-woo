import { Link } from "@/i18n/navigation";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 shrink-0 items-center gap-2 font-semibold tracking-tight whitespace-nowrap">
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
      >
        W
      </span>
      <span className="text-lg">CV Woo</span>
    </Link>
  );
}
