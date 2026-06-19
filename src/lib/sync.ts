import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountBase, Holding, Security } from "plaid";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { getPlaidClient } from "@/lib/plaid";
import { classifyTaxTreatment, isDebtType } from "@/lib/tax-classification";
import { computeAndStoreSnapshot } from "@/lib/snapshot";

type Admin = SupabaseClient;

export type SyncResult = { accounts: number; holdings: number };

/** Sync every linked Plaid item for a user into normalized tables. */
export async function syncUser(userId: string): Promise<SyncResult> {
  const admin = createAdminClient();

  const { data: items, error } = await admin
    .from("plaid_items")
    .select("id, access_token_encrypted")
    .eq("user_id", userId);

  if (error) throw error;

  const totals: SyncResult = { accounts: 0, holdings: 0 };
  for (const item of items ?? []) {
    const token = decrypt(item.access_token_encrypted as string);
    const res = await syncItem(admin, userId, item.id as string, token);
    totals.accounts += res.accounts;
    totals.holdings += res.holdings;

    await admin
      .from("plaid_items")
      .update({ last_synced_at: new Date().toISOString(), status: "active" })
      .eq("id", item.id);
  }

  // Refresh today's net-worth snapshot from the newly synced balances.
  await computeAndStoreSnapshot(userId);

  return totals;
}

/** Sync a single Plaid item (one institution). */
export async function syncItem(
  admin: Admin,
  userId: string,
  itemId: string,
  accessToken: string,
): Promise<SyncResult> {
  const plaid = getPlaidClient();

  // 1. Accounts + balances (covers depository, investment, loan and credit).
  const balances = await plaid.accountsBalanceGet({ access_token: accessToken });
  const accounts = balances.data.accounts;

  const accountIdMap = new Map<string, string>(); // plaid_account_id -> our uuid
  for (const acct of accounts) {
    const ourId = await upsertAccount(admin, userId, itemId, acct);
    accountIdMap.set(acct.account_id, ourId);
  }

  // 2. Investment holdings + securities (best-effort; not all items have them).
  let holdingsCount = 0;
  try {
    const inv = await plaid.investmentsHoldingsGet({ access_token: accessToken });
    const securityIdMap = new Map<string, string>();
    for (const sec of inv.data.securities) {
      const ourId = await upsertSecurity(admin, userId, sec);
      securityIdMap.set(sec.security_id, ourId);
    }
    holdingsCount = await replaceHoldings(
      admin,
      userId,
      inv.data.holdings,
      accountIdMap,
      securityIdMap,
    );
  } catch (err) {
    // Items without investment accounts return PRODUCTS_NOT_SUPPORTED etc.
    console.warn("investmentsHoldingsGet skipped:", extractPlaidError(err));
  }

  return { accounts: accounts.length, holdings: holdingsCount };
}

async function upsertAccount(
  admin: Admin,
  userId: string,
  itemId: string,
  acct: AccountBase,
): Promise<string> {
  const row = {
    user_id: userId,
    item_id: itemId,
    plaid_account_id: acct.account_id,
    name: acct.name,
    official_name: acct.official_name ?? null,
    type: acct.type ?? null,
    subtype: acct.subtype ?? null,
    tax_treatment: classifyTaxTreatment(acct.type, acct.subtype),
    is_manual: false,
    is_debt: isDebtType(acct.type),
    current_balance: acct.balances.current ?? null,
    available_balance: acct.balances.available ?? null,
    iso_currency: acct.balances.iso_currency_code ?? "USD",
    mask: acct.mask ?? null,
  };

  const { data: existing } = await admin
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("plaid_account_id", acct.account_id)
    .maybeSingle();

  if (existing) {
    // Do not overwrite tax_treatment_override (omitted from the payload).
    await admin.from("accounts").update(row).eq("id", existing.id);
    return existing.id as string;
  }

  const { data: inserted, error } = await admin
    .from("accounts")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id as string;
}

async function upsertSecurity(
  admin: Admin,
  userId: string,
  sec: Security,
): Promise<string> {
  const row = {
    user_id: userId,
    plaid_security_id: sec.security_id,
    ticker: sec.ticker_symbol ?? null,
    name: sec.name ?? null,
    security_type: sec.type ?? null,
    close_price: sec.close_price ?? null,
    close_price_as_of: sec.close_price_as_of ?? null,
    iso_currency: sec.iso_currency_code ?? "USD",
    is_cash_equivalent: sec.is_cash_equivalent ?? false,
  };

  const { data: existing } = await admin
    .from("securities")
    .select("id")
    .eq("user_id", userId)
    .eq("plaid_security_id", sec.security_id)
    .maybeSingle();

  if (existing) {
    await admin.from("securities").update(row).eq("id", existing.id);
    return existing.id as string;
  }

  const { data: inserted, error } = await admin
    .from("securities")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id as string;
}

/** Replace all holdings for the synced accounts (idempotent refresh). */
async function replaceHoldings(
  admin: Admin,
  userId: string,
  holdings: Holding[],
  accountIdMap: Map<string, string>,
  securityIdMap: Map<string, string>,
): Promise<number> {
  const accountIds = [...accountIdMap.values()];
  if (accountIds.length > 0) {
    await admin
      .from("holdings")
      .delete()
      .eq("user_id", userId)
      .in("account_id", accountIds);
  }

  const rows = holdings
    .map((h) => {
      const accountId = accountIdMap.get(h.account_id);
      const securityId = securityIdMap.get(h.security_id);
      if (!accountId || !securityId) return null;
      return {
        user_id: userId,
        account_id: accountId,
        security_id: securityId,
        quantity: h.quantity ?? null,
        cost_basis: h.cost_basis ?? null,
        institution_price: h.institution_price ?? null,
        institution_value: h.institution_value ?? null,
        iso_currency: h.iso_currency_code ?? "USD",
        as_of_date: h.institution_price_as_of ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    const { error } = await admin.from("holdings").insert(rows);
    if (error) throw error;
  }
  return rows.length;
}

export function extractPlaidError(err: unknown) {
  if (err && typeof err === "object" && "response" in err) {
    const r = (err as { response?: { data?: unknown } }).response;
    return r?.data ?? err;
  }
  return err;
}
