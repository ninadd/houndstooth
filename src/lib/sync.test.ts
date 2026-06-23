import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock-provider path: no SnapTrade credentials or network needed.
process.env.DATA_PROVIDER = "mock";

// A tiny in-memory Supabase stand-in supporting just what syncUser drives:
// from().select/delete/upsert/update with .eq()/.in() filters, awaitable.
type Row = Record<string, unknown>;
let store: Record<string, Row[]>;
function makeAdmin() {
  let seq = 0;
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let op = "select";
      let payload: Row | Row[] | undefined;
      let onConflict: string | undefined;
      const match = () => (store[table] ?? []).filter((r) => filters.every((f) => f(r)));
      const api: Record<string, unknown> = {
        select() { return api; },
        insert(p: Row | Row[]) { op = "insert"; payload = p; return api; },
        update(p: Row) { op = "update"; payload = p; return api; },
        upsert(p: Row | Row[], o?: { onConflict?: string }) {
          op = "upsert"; payload = p; onConflict = o?.onConflict; return api;
        },
        delete() { op = "delete"; return api; },
        eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return api; },
        in(c: string, vs: unknown[]) { const s = new Set(vs); filters.push((r) => s.has(r[c])); return api; },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
          try { return Promise.resolve(exec()).then(res, rej); }
          catch (e) { return Promise.reject(e).then(res, rej); }
        },
      };
      function exec() {
        const rows = (store[table] ??= []);
        if (op === "select") return { data: match(), error: null, count: match().length };
        if (op === "delete") { store[table] = rows.filter((r) => !filters.every((f) => f(r))); return { data: null, error: null }; }
        if (op === "update") { for (const r of match()) Object.assign(r, payload); return { data: null, error: null }; }
        const arr = Array.isArray(payload) ? payload : [payload as Row];
        if (op === "insert") { for (const r of arr) { r.id ??= `gen-${++seq}`; rows.push(r); } return { data: arr, error: null }; }
        // upsert
        const keys = (onConflict ?? "id").split(",");
        for (const r of arr) {
          const ex = rows.find((x) => keys.every((k) => x[k] === r[k]));
          if (ex) Object.assign(ex, r);
          else { r.id ??= `gen-${++seq}`; rows.push(r); }
        }
        return { data: arr, error: null };
      }
      return api;
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));
// Isolate from real ingest/snapshot — we're testing reconcile + prune wiring.
vi.mock("@/lib/ingest", () => ({ ingestSnapshot: vi.fn(async () => ({ accounts: 2, holdings: 2 })) }));
vi.mock("@/lib/snapshot", () => ({ computeAndStoreSnapshot: vi.fn(async () => {}) }));

import { syncUser, staleKeys } from "./sync";

const U = "user-1";

describe("staleKeys", () => {
  it("returns keys in the DB but not in the live response", () => {
    expect(staleKeys(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });
  it("returns all keys when the live response is empty", () => {
    expect(staleKeys(["a", "b"], [])).toEqual(["a", "b"]);
  });
  it("removes nothing when DB matches live (idempotent re-sync)", () => {
    expect(staleKeys(["a", "b"], ["a", "b"])).toEqual([]);
  });
});

describe("syncUser reconciliation (mock provider)", () => {
  // MockProvider reports one connection "mock-auth-1" with accounts
  // mock-acct-taxable / mock-acct-roth.
  beforeEach(() => {
    store = {
      connections: [
        { id: "c-old", user_id: U, authorization_id: "OLD-AUTH" }, // stale
        { id: "c-live", user_id: U, authorization_id: "mock-auth-1" },
      ],
      accounts: [
        { id: "a-stale", user_id: U, external_account_id: "GONE-ACCT", is_manual: false },
        { id: "a-keep", user_id: U, external_account_id: "mock-acct-taxable", is_manual: false },
        { id: "a-manual", user_id: U, external_account_id: null, is_manual: true },
      ],
      securities: [
        { id: "s-ref", user_id: U },
        { id: "s-orphan", user_id: U },
      ],
      holdings: [{ id: "h1", user_id: U, account_id: "a-keep", security_id: "s-ref" }],
      net_worth_snapshots: [],
    };
  });

  it("removes connections no longer in SnapTrade's response", async () => {
    await syncUser(U);
    const auths = store.connections.map((c) => c.authorization_id);
    expect(auths).toContain("mock-auth-1");
    expect(auths).not.toContain("OLD-AUTH");
  });

  it("removes accounts no longer returned, but keeps manual accounts", async () => {
    await syncUser(U);
    const ext = store.accounts.map((a) => a.external_account_id);
    expect(ext).not.toContain("GONE-ACCT"); // pruned
    expect(ext).toContain("mock-acct-taxable"); // still live
    expect(store.accounts.some((a) => a.id === "a-manual")).toBe(true); // protected
  });

  it("removes securities with no remaining holdings", async () => {
    await syncUser(U);
    const ids = store.securities.map((s) => s.id);
    expect(ids).toContain("s-ref");
    expect(ids).not.toContain("s-orphan");
  });

  it("is idempotent — a second sync removes nothing further", async () => {
    await syncUser(U);
    const after1 = JSON.stringify(store);
    await syncUser(U);
    expect(JSON.stringify(store)).toBe(after1);
  });
});
