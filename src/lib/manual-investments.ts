import type { SupabaseClient } from "@supabase/supabase-js";
import yahooFinance from "@/lib/yahoo-finance";
import { createAdminClient } from "@/lib/supabase/admin";

type Client = SupabaseClient;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Find (or create) the user's `securities` row for `ticker`, fetching its
 * latest price from Yahoo Finance when it doesn't already exist. Reuses a
 * security already tracked for this user — including one created by
 * SnapTrade sync — rather than duplicating it.
 */
async function resolveSecurity(
  supabase: Client,
  userId: string,
  ticker: string,
): Promise<{ id: string; price: number }> {
  const symbol = ticker.trim().toUpperCase();

  const { data: existing } = await supabase
    .from("securities")
    .select("id, close_price")
    .eq("user_id", userId)
    .ilike("ticker", symbol)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { id: existing.id as string, price: Number(existing.close_price ?? 0) };
  }

  // An unrecognized ticker resolves to `undefined` rather than throwing.
  const quote = await yahooFinance.quote(symbol);
  if (!quote) throw new Error(`No Yahoo Finance quote for "${symbol}"`);
  const price = quote.regularMarketPrice ?? 0;
  const name = quote.longName ?? quote.shortName ?? symbol;

  const { data: inserted, error } = await supabase
    .from("securities")
    .insert({
      user_id: userId,
      ticker: symbol,
      name,
      close_price: price,
      close_price_as_of: todayISO(),
    })
    .select("id")
    .single();
  if (error) throw error;

  return { id: inserted.id as string, price };
}

/**
 * Create one holding (position) under a manual investment account, which may
 * carry several. On edit, callers clear all existing holdings first and
 * recreate the submitted set — see `deleteManualInvestmentHolding`. Returns
 * the resulting position value (quantity * price).
 */
export async function createManualInvestmentHolding(
  supabase: Client,
  userId: string,
  accountId: string,
  ticker: string,
  quantity: number,
  costBasis: number | null,
): Promise<number> {
  const security = await resolveSecurity(supabase, userId, ticker);
  const value = round2(quantity * security.price);

  const { error } = await supabase.from("holdings").insert({
    user_id: userId,
    account_id: accountId,
    security_id: security.id,
    quantity,
    cost_basis: costBasis,
    institution_price: security.price,
    institution_value: value,
    as_of_date: todayISO(),
  });
  if (error) throw error;

  return value;
}

/** Clear every holding backing a manual investment account (e.g. before
 *  recreating the submitted set on edit, or when the account's type changes). */
export async function deleteManualInvestmentHolding(
  supabase: Client,
  accountId: string,
): Promise<void> {
  await supabase.from("holdings").delete().eq("account_id", accountId);
}

/**
 * Refresh every ticker-backed manual investment holding from Yahoo Finance:
 * updates each security's price, the day's `security_prices` row (so existing
 * day-over-day move detection picks these up transparently), each holding's
 * value, and — since an account can carry several holdings — each account's
 * current_balance as the *sum* of its holdings' values. Returns the number of
 * holdings refreshed (0 if there are none, or none resolve to a live price).
 */
export async function refreshManualHoldingPrices(userId: string): Promise<number> {
  const admin = createAdminClient();

  const { data: accounts } = await admin
    .from("accounts")
    .select("id, holdings(id, security_id, quantity, institution_value, securities(ticker))")
    .eq("user_id", userId)
    .eq("is_manual", true)
    .eq("manual_category", "investment");

  type Position = {
    holdingId: string;
    accountId: string;
    securityId: string;
    ticker: string;
    quantity: number;
    lastValue: number;
  };
  const positions: Position[] = [];
  for (const acct of accounts ?? []) {
    for (const h of (acct.holdings ?? []) as {
      id: string;
      security_id: string;
      quantity: number | null;
      institution_value: number | null;
      securities: { ticker: string | null } | { ticker: string | null }[] | null;
    }[]) {
      const sec = Array.isArray(h.securities) ? h.securities[0] : h.securities;
      if (!sec?.ticker) continue;
      positions.push({
        holdingId: h.id,
        accountId: acct.id as string,
        securityId: h.security_id,
        ticker: sec.ticker,
        quantity: h.quantity == null ? 0 : Number(h.quantity),
        lastValue: h.institution_value == null ? 0 : Number(h.institution_value),
      });
    }
  }
  if (positions.length === 0) return 0;

  const tickers = [...new Set(positions.map((p) => p.ticker.toUpperCase()))];
  const quotes = await yahooFinance.quote(tickers);
  const priceByTicker = new Map(
    quotes.map((q) => [q.symbol.toUpperCase(), q.regularMarketPrice ?? 0]),
  );

  const today = todayISO();
  const accountTotals = new Map<string, number>();
  let refreshed = 0;

  for (const pos of positions) {
    const price = priceByTicker.get(pos.ticker.toUpperCase());
    // Fall back to the holding's last-known value when today's quote is
    // missing, so one bad ticker doesn't zero out the rest of the account.
    const value = price == null ? pos.lastValue : round2(pos.quantity * price);
    accountTotals.set(pos.accountId, (accountTotals.get(pos.accountId) ?? 0) + value);
    if (price == null) continue;
    refreshed += 1;

    await Promise.all([
      admin
        .from("securities")
        .update({ close_price: price, close_price_as_of: today })
        .eq("id", pos.securityId),
      admin.from("security_prices").upsert(
        { user_id: userId, security_id: pos.securityId, price_date: today, close_price: price },
        { onConflict: "user_id,security_id,price_date" },
      ),
      admin
        .from("holdings")
        .update({ institution_price: price, institution_value: value, as_of_date: today })
        .eq("id", pos.holdingId),
    ]);
  }

  await Promise.all(
    [...accountTotals].map(([accountId, total]) =>
      admin.from("accounts").update({ current_balance: round2(total) }).eq("id", accountId),
    ),
  );

  return refreshed;
}
