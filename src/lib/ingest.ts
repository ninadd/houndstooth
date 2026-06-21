import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InternalAccount,
  InternalHolding,
  InternalSecurity,
  ProviderSnapshot,
} from "@/lib/providers/types";
import { classifyTaxTreatment } from "@/lib/tax-classification";
import { pacificDate } from "@/lib/snapshot";

type Admin = SupabaseClient;

export type IngestResult = { accounts: number; holdings: number };

/**
 * Persist one connection's provider snapshot into the normalized tables.
 * Provider-agnostic: takes the internal schema, not any SDK shape. Idempotent —
 * accounts/securities upsert by external id; holdings are replaced wholesale.
 */
export async function ingestSnapshot(
  admin: Admin,
  userId: string,
  connectionId: string,
  snapshot: ProviderSnapshot,
): Promise<IngestResult> {
  const accountIdMap = new Map<string, string>(); // externalId -> our uuid
  for (const acct of snapshot.accounts) {
    const ourId = await upsertAccount(admin, userId, connectionId, acct);
    accountIdMap.set(acct.externalId, ourId);
  }

  const securityIdMap = new Map<string, string>();
  const priceRows: {
    user_id: string;
    security_id: string;
    price_date: string;
    close_price: number;
  }[] = [];
  const today = pacificDate();
  for (const sec of snapshot.securities) {
    const ourId = await upsertSecurity(admin, userId, sec);
    securityIdMap.set(sec.externalId, ourId);
    if (sec.closePrice != null) {
      priceRows.push({
        user_id: userId,
        security_id: ourId,
        price_date: today,
        close_price: sec.closePrice,
      });
    }
  }
  // Append today's close prices for day-over-day change (idempotent per day).
  if (priceRows.length > 0) {
    await admin
      .from("security_prices")
      .upsert(priceRows, { onConflict: "user_id,security_id,price_date" });
  }

  const holdingsCount = await replaceHoldings(
    admin,
    userId,
    snapshot.holdings,
    accountIdMap,
    securityIdMap,
  );

  return { accounts: snapshot.accounts.length, holdings: holdingsCount };
}

async function upsertAccount(
  admin: Admin,
  userId: string,
  connectionId: string,
  acct: InternalAccount,
): Promise<string> {
  const row = {
    user_id: userId,
    connection_id: connectionId,
    external_account_id: acct.externalId,
    name: acct.name,
    official_name: acct.officialName,
    type: acct.type,
    subtype: acct.subtype,
    tax_treatment: classifyTaxTreatment(acct.type, acct.subtype, acct.name),
    is_manual: false,
    is_debt: acct.isDebt,
    current_balance: acct.currentBalance,
    available_balance: acct.availableBalance,
    iso_currency: acct.isoCurrency,
    mask: acct.mask,
  };

  const { data: existing } = await admin
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("external_account_id", acct.externalId)
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
  sec: InternalSecurity,
): Promise<string> {
  const row = {
    user_id: userId,
    external_security_id: sec.externalId,
    ticker: sec.ticker,
    name: sec.name,
    security_type: sec.securityType,
    close_price: sec.closePrice,
    close_price_as_of: sec.closePriceAsOf,
    iso_currency: sec.isoCurrency,
    is_cash_equivalent: sec.isCashEquivalent,
  };

  const { data: existing } = await admin
    .from("securities")
    .select("id")
    .eq("user_id", userId)
    .eq("external_security_id", sec.externalId)
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
  holdings: InternalHolding[],
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
      const accountId = accountIdMap.get(h.accountExternalId);
      const securityId = securityIdMap.get(h.securityExternalId);
      if (!accountId || !securityId) return null;
      return {
        user_id: userId,
        account_id: accountId,
        security_id: securityId,
        quantity: h.quantity,
        cost_basis: h.costBasis,
        institution_price: h.institutionPrice,
        institution_value: h.institutionValue,
        iso_currency: h.isoCurrency,
        as_of_date: h.asOfDate,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    const { error } = await admin.from("holdings").insert(rows);
    if (error) throw error;
  }
  return rows.length;
}
