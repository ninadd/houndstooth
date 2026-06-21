import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeNetWorth,
  pacificDate,
  type SnapshotAccount,
  type SnapshotManualAsset,
} from "@/lib/snapshot";

const DAY_MS = 86_400_000;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** mulberry32 — tiny deterministic PRNG so the seeded history is stable. */
function makeRng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seed synthetic daily net-worth history for the past `days`, derived from the
 * user's CURRENT figures. Home value and debts are held constant; investable
 * assets follow a gentle upward random walk backward in time, so today is the
 * latest point. Today's real snapshot and any existing rows are NOT overwritten
 * (insert ignores conflicts).
 *
 * Intended for Sandbox/demo data only — real history accrues via the M4 cron.
 */
export async function backfillSnapshots(
  userId: string,
  days = 365,
): Promise<{ inserted: number }> {
  const admin = createAdminClient();

  const [{ data: accounts }, { data: manualAssets }] = await Promise.all([
    admin
      .from("accounts")
      .select(
        "current_balance, is_debt, type, subtype, name, tax_treatment, tax_treatment_override",
      )
      .eq("user_id", userId),
    admin
      .from("manual_assets")
      .select("value, is_debt, asset_class, tax_treatment")
      .eq("user_id", userId),
  ]);

  const figures = computeNetWorth(
    (accounts ?? []).map(
      (a): SnapshotAccount => ({
        current_balance:
          a.current_balance == null ? null : Number(a.current_balance),
        is_debt: a.is_debt,
        type: a.type,
        subtype: a.subtype,
        name: a.name,
        tax_treatment: a.tax_treatment,
        tax_treatment_override: a.tax_treatment_override,
      }),
    ),
    (manualAssets ?? []).map(
      (m): SnapshotManualAsset => ({
        value: Number(m.value),
        is_debt: m.is_debt,
        asset_class: m.asset_class,
        tax_treatment: m.tax_treatment,
      }),
    ),
  );

  if (figures.total_assets === 0) return { inserted: 0 };

  const home = figures.home_value;
  const debts = figures.total_debts;
  const ratioAdv =
    figures.investable_assets > 0
      ? figures.tax_advantaged_total / figures.investable_assets
      : 0;

  // Backward multiplicative walk: values[i] = investable assets i days ago.
  const rng = makeRng(0x484f554e); // "HOUN"
  const drift = 0.0006; // ~ +25% / yr long-run trend
  const volatility = 0.012; // ~1.2% daily swing
  const walk: number[] = [figures.investable_assets];
  for (let i = 1; i <= days; i++) {
    const prev = walk[i - 1];
    const shock = (rng() - 0.5) * volatility;
    walk.push(prev / (1 + drift + shock));
  }

  const base = Date.now();
  const rows = [];
  for (let i = 1; i <= days; i++) {
    const investable = walk[i];
    const totalAssets = investable + home;
    rows.push({
      user_id: userId,
      snapshot_date: pacificDate(new Date(base - i * DAY_MS)),
      total_assets: round2(totalAssets),
      total_debts: round2(debts),
      net_worth: round2(totalAssets - debts),
      investable_assets: round2(investable),
      home_value: round2(home),
      taxable_total: round2(investable * (1 - ratioAdv)),
      tax_advantaged_total: round2(investable * ratioAdv),
    });
  }

  // ignoreDuplicates: never clobber today's real snapshot or existing rows.
  const { error, count } = await admin
    .from("net_worth_snapshots")
    .upsert(rows, {
      onConflict: "user_id,snapshot_date",
      ignoreDuplicates: true,
      count: "exact",
    });
  if (error) throw error;

  return { inserted: count ?? 0 };
}
