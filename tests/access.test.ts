import { beforeEach, describe, expect, it, vi } from "vitest";

// Règles d'accès : 1 essai sans compte, puis compte obligatoire ; 5 adaptations par mois avec un compte.
// La session Supabase et les cookies du navigateur sont simulés (aucune vraie base de données).

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));

type FakeState = { user: { id: string } | null; used: number; quota: number | null; inserts: unknown[] };
const state: FakeState = { user: null, used: 0, quota: 5, inserts: [] };

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === "plans") {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: state.quota === null ? null : { analyses_quota: state.quota } }),
        };
        return q;
      }
      const q = {
        select: () => q,
        eq: () => q,
        gte: () => q,
        then: (resolve: (v: { count: number }) => void) => resolve({ count: state.used }),
        insert: async (row: unknown) => {
          state.inserts.push(row);
          return { error: null };
        },
      };
      return q;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ supabase: fakeSupabase(), user: state.user }),
}));

const { checkAnalyzeAccess, recordAnalyze, monthlyUsage } = await import("@/lib/access");

const req = (ip = "203.0.113.7") => new Request("https://cv-woo.test/api/analyze", { headers: { "x-forwarded-for": ip } });
const codeOf = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code);

beforeEach(() => {
  jar.clear();
  Object.assign(state, { user: null, used: 0, quota: 5, inserts: [] });
  process.env.APP_SECRET = "secret-de-test";
});

describe("sans compte", () => {
  it("autorise la première adaptation", async () => {
    expect(await codeOf(checkAnalyzeAccess(req()))).toBeNull();
  });

  it("demande un compte après l'essai gratuit", async () => {
    const ctx = await checkAnalyzeAccess(req());
    await recordAnalyze(req(), ctx);
    expect(jar.get("cvw_trial")).toBeTruthy();
    expect(await codeOf(checkAnalyzeAccess(req()))).toBe("auth_required");
  });

  it("ignore un cookie d'essai falsifié", async () => {
    jar.set("cvw_trial", "faux-cookie");
    expect(await codeOf(checkAnalyzeAccess(req()))).toBeNull();
  });

  it("refuse un cookie signé avec un autre secret", async () => {
    const ctx = await checkAnalyzeAccess(req());
    await recordAnalyze(req(), ctx);
    process.env.APP_SECRET = "autre-secret";
    expect(await codeOf(checkAnalyzeAccess(req()))).toBeNull();
  });
});

describe("avec un compte", () => {
  beforeEach(() => {
    state.user = { id: "utilisateur-fictif" };
  });

  it("autorise tant que le quota n'est pas atteint et indique le reste", async () => {
    state.used = 2;
    const ctx = await checkAnalyzeAccess(req());
    expect(ctx.remaining).toBe(3);
  });

  it("bloque à 5 adaptations sur le mois", async () => {
    state.used = 5;
    expect(await codeOf(checkAnalyzeAccess(req()))).toBe("quota_reached");
  });

  it("n'est pas bloqué par l'essai gratuit déjà utilisé sans compte", async () => {
    await recordAnalyze(req(), { supabase: fakeSupabase(), user: null, remaining: null } as never);
    state.user = { id: "utilisateur-fictif" };
    expect(await codeOf(checkAnalyzeAccess(req()))).toBeNull();
  });

  it("enregistre chaque adaptation réussie dans le compteur", async () => {
    const ctx = await checkAnalyzeAccess(req());
    await recordAnalyze(req(), ctx);
    expect(state.inserts).toEqual([{ user_id: "utilisateur-fictif", kind: "analysis" }]);
    expect(jar.has("cvw_trial")).toBe(false);
  });

  it("utilise 5 par défaut si la formule est introuvable", async () => {
    state.quota = null;
    expect(await monthlyUsage(fakeSupabase() as never, "utilisateur-fictif")).toEqual({ used: 0, quota: 5 });
  });
});
