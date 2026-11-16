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

type FakeState = {
  user: { id: string } | null;
  used: number;
  quota: number | null;
  inserts: unknown[];
  hits: Map<string, number>;
  rpcDown: boolean;
  admin?: boolean;
};
const state: FakeState = { user: null, used: 0, quota: 5, inserts: [], hits: new Map(), rpcDown: false };

function fakeSupabase() {
  return {
    // Fonctions Supabase simulées : rate_hit (limites durables) et claim_analysis (quota atomique)
    async rpc(name: string, args: Record<string, unknown> = {}) {
      if (state.rpcDown) return { data: null, error: { code: "PGRST202" } };
      if (name === "rate_hit") {
        const key = `${args.p_bucket}:${args.p_key}`;
        const n = state.hits.get(key) ?? 0;
        if (n >= (args.p_max as number)) return { data: false, error: null };
        state.hits.set(key, n + 1);
        return { data: true, error: null };
      }
      if (name === "claim_analysis") {
        if (state.admin) return { data: 999, error: null };
        const quota = state.quota ?? 5;
        if (state.used >= quota) return { data: -1, error: null };
        state.used++;
        state.inserts.push({ user_id: state.user!.id, kind: "analysis" });
        return { data: quota - state.used, error: null };
      }
      return { data: null, error: { code: "unknown" } };
    },
    from(table: string) {
      if (table === "profiles") {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { role: state.admin ? "admin" : "user" } }) };
        return q;
      }
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
  Object.assign(state, { user: null, used: 0, quota: 5, inserts: [], hits: new Map(), rpcDown: false, admin: false });
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

  it("garde l'essai utilisé même si la personne efface ses cookies", async () => {
    const ctx = await checkAnalyzeAccess(req());
    await recordAnalyze(req(), ctx);
    jar.clear();
    expect(await codeOf(checkAnalyzeAccess(req()))).toBe("auth_required");
    // Une autre adresse IP a droit à son propre essai
    expect(await codeOf(checkAnalyzeAccess(req("198.51.100.20")))).toBeNull();
  });

  it("laisse passer si la base est momentanément injoignable", async () => {
    state.rpcDown = true;
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
    await recordAnalyze(req(), { supabase: fakeSupabase(), user: null, remaining: null, claimed: false } as never);
    state.user = { id: "utilisateur-fictif" };
    expect(await codeOf(checkAnalyzeAccess(req()))).toBeNull();
  });

  it("compte chaque adaptation une seule fois", async () => {
    const ctx = await checkAnalyzeAccess(req());
    await recordAnalyze(req(), ctx);
    expect(state.inserts).toEqual([{ user_id: "utilisateur-fictif", kind: "analysis" }]);
    expect(jar.has("cvw_trial")).toBe(false);
  });

  it("ne laisse pas passer 10 adaptations lancées en même temps au-delà du quota", async () => {
    state.used = 3;
    const results = await Promise.all(Array.from({ length: 10 }, () => codeOf(checkAnalyzeAccess(req()))));
    expect(results.filter((r) => r === null)).toHaveLength(2);
    expect(results.filter((r) => r === "quota_reached")).toHaveLength(8);
  });

  it("revient à l'ancienne vérification si la réservation est indisponible", async () => {
    state.rpcDown = true;
    state.used = 1;
    const ctx = await checkAnalyzeAccess(req());
    expect(ctx.remaining).toBe(4);
    await recordAnalyze(req(), ctx);
    expect(state.inserts).toHaveLength(1);
  });

  it("utilise 5 par défaut si la formule est introuvable", async () => {
    state.quota = null;
    expect(await monthlyUsage(fakeSupabase() as never, "utilisateur-fictif")).toEqual({ used: 0, quota: 5, unlimited: false });
  });

  it("laisse un administrateur adapter sans limite", async () => {
    state.admin = true;
    state.used = 50;
    const ctx = await checkAnalyzeAccess(req());
    expect(ctx.remaining).toBeNull();
    state.rpcDown = true;
    expect(await codeOf(checkAnalyzeAccess(req()))).toBeNull();
  });
});
