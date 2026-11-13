import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Retour du lien de confirmation d'e-mail : on ouvre la session puis on renvoie vers l'app.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/fr/adapt";
  // Uniquement une redirection interne (jamais vers un autre site)
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/fr/adapt";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  }
  return NextResponse.redirect(new URL("/fr/login?error=link", url.origin));
}
