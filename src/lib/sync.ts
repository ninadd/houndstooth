import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/providers";
import { snapTradeCredentials } from "@/lib/providers/snaptrade/credentials";
import type { ProviderConnection } from "@/lib/providers/types";
import { ingestSnapshot } from "@/lib/ingest";
import { computeAndStoreSnapshot } from "@/lib/snapshot";

type Admin = SupabaseClient;

export type SyncResult = { accounts: number; holdings: number };

/**
 * Sync the connected brokerages into the normalized tables, via the active data
 * provider (SnapTrade, or Mock when DATA_PROVIDER=mock). `userId` scopes the DB
 * rows (our auth.uid()); SnapTrade is accessed with the single personal-tier
 * credential pair from env. Reconciles the connections table, pulls each
 * connection, then recomputes today's net-worth snapshot.
 */
export async function syncUser(userId: string): Promise<SyncResult> {
  const admin = createAdminClient();
  const provider = getProvider();

  // Personal SnapTrade keys have one fixed, pre-provisioned user (no per-user
  // registration). The Mock provider ignores these values.
  const creds = snapTradeCredentials();
  if (!creds && provider.name !== "mock") {
    // Credentials not configured — nothing to sync.
    return { accounts: 0, holdings: 0 };
  }
  const snapTradeUserId = creds?.userId ?? "mock-user";
  const userSecret = creds?.userSecret ?? "mock-user-secret";

  // Reconcile the connections table against what the provider reports.
  const remote = await provider.listConnections(snapTradeUserId, userSecret);
  await reconcileConnections(admin, userId, remote);

  const { data: connections } = await admin
    .from("connections")
    .select("id, authorization_id")
    .eq("user_id", userId);

  const totals: SyncResult = { accounts: 0, holdings: 0 };
  const liveAccountIds: string[] = [];
  for (const conn of connections ?? []) {
    const snapshot = await provider.fetchConnection({
      snapTradeUserId,
      userSecret,
      authorizationId: conn.authorization_id as string,
    });
    for (const a of snapshot.accounts) liveAccountIds.push(a.externalId);
    const res = await ingestSnapshot(admin, userId, conn.id as string, snapshot);
    totals.accounts += res.accounts;
    totals.holdings += res.holdings;

    await admin
      .from("connections")
      .update({ last_synced_at: new Date().toISOString(), status: "active" })
      .eq("id", conn.id);
  }

  // Prune anything SnapTrade no longer returns: accounts removed from a still-
  // connected brokerage (their holdings cascade), then securities left with no
  // holdings. Connection-level pruning already ran in reconcileConnections.
  await pruneAccounts(admin, userId, liveAccountIds);
  await pruneOrphanSecurities(admin, userId);

  // Refresh today's net-worth snapshot from the newly synced balances.
  await computeAndStoreSnapshot(userId);

  return totals;
}

/**
 * Keys present in the DB but absent from the provider's latest response — i.e.
 * the rows to remove. Pure set difference; the single source of truth for what
 * "no longer in SnapTrade" means, shared by every prune step below.
 */
export function staleKeys(existing: string[], live: string[]): string[] {
  const liveSet = new Set(live);
  return existing.filter((key) => !liveSet.has(key));
}

/**
 * Delete provider-sourced accounts whose external id SnapTrade no longer returns
 * (e.g. an account closed under a still-connected brokerage). Holdings cascade.
 * Manual accounts (is_manual = true) are never touched.
 */
async function pruneAccounts(
  admin: Admin,
  userId: string,
  liveExternalIds: string[],
): Promise<void> {
  const { data: existing } = await admin
    .from("accounts")
    .select("id, external_account_id")
    .eq("user_id", userId)
    .eq("is_manual", false);

  const stale = new Set(
    staleKeys(
      (existing ?? []).map((a) => a.external_account_id as string),
      liveExternalIds,
    ),
  );
  const staleAccountIds = (existing ?? [])
    .filter((a) => stale.has(a.external_account_id as string))
    .map((a) => a.id as string);
  if (staleAccountIds.length > 0) {
    await admin.from("accounts").delete().in("id", staleAccountIds);
  }
}

/**
 * Delete securities no longer referenced by any holding (cascades their
 * security_prices). Keeps reference data in step with SnapTrade's positions.
 */
async function pruneOrphanSecurities(
  admin: Admin,
  userId: string,
): Promise<void> {
  const [{ data: holdings }, { data: securities }] = await Promise.all([
    admin.from("holdings").select("security_id").eq("user_id", userId),
    admin.from("securities").select("id").eq("user_id", userId),
  ]);
  const orphanIds = staleKeys(
    (securities ?? []).map((s) => s.id as string),
    (holdings ?? []).map((h) => h.security_id as string),
  );
  if (orphanIds.length > 0) {
    await admin.from("securities").delete().eq("user_id", userId).in("id", orphanIds);
  }
}

/**
 * Reconcile the connections table to exactly what the provider reports:
 * prune connections (and, via ON DELETE CASCADE, their accounts + holdings) whose
 * authorization no longer exists — e.g. after a brokerage is reconnected and gets
 * a new authorization id — then upsert the current ones.
 */
async function reconcileConnections(
  admin: Admin,
  userId: string,
  remote: ProviderConnection[],
): Promise<void> {
  const liveAuthIds = remote.map((c) => c.authorizationId);
  const { data: existing } = await admin
    .from("connections")
    .select("id, authorization_id")
    .eq("user_id", userId);

  const stale = new Set(
    staleKeys(
      (existing ?? []).map((c) => c.authorization_id as string),
      liveAuthIds,
    ),
  );
  const staleConnIds = (existing ?? [])
    .filter((c) => stale.has(c.authorization_id as string))
    .map((c) => c.id as string);
  if (staleConnIds.length > 0) {
    await admin.from("connections").delete().in("id", staleConnIds);
  }

  if (remote.length === 0) return;
  const rows = remote.map((c) => ({
    user_id: userId,
    authorization_id: c.authorizationId,
    institution_name: c.institutionName,
    status: "active",
  }));
  await admin
    .from("connections")
    .upsert(rows, { onConflict: "authorization_id" });
}

/** Extract a provider's structured error payload (axios-style) for logging. */
export function extractProviderError(err: unknown) {
  if (err && typeof err === "object" && "response" in err) {
    const r = (err as { response?: { data?: unknown } }).response;
    return r?.data ?? err;
  }
  return err;
}
