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
  for (const conn of connections ?? []) {
    const snapshot = await provider.fetchConnection({
      snapTradeUserId,
      userSecret,
      authorizationId: conn.authorization_id as string,
    });
    const res = await ingestSnapshot(admin, userId, conn.id as string, snapshot);
    totals.accounts += res.accounts;
    totals.holdings += res.holdings;

    await admin
      .from("connections")
      .update({ last_synced_at: new Date().toISOString(), status: "active" })
      .eq("id", conn.id);
  }

  // Refresh today's net-worth snapshot from the newly synced balances.
  await computeAndStoreSnapshot(userId);

  return totals;
}

/** Upsert a connection row for each authorization the provider reports. */
async function reconcileConnections(
  admin: Admin,
  userId: string,
  remote: ProviderConnection[],
): Promise<void> {
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
