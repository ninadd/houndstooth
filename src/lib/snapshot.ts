import { createAdminClient } from "@/lib/supabase/admin";
import {
  effectiveTaxTreatment,
  type TaxTreatment,
} from "@/lib/tax-classification";

export type SnapshotAccount = {
  current_balance: number | null;
  is_debt: boolean;
  type: string | null;
  subtype: string | null;
  name?: string | null;
  tax_treatment: TaxTreatment;
  tax_treatment_override: TaxTreatment | null;
};

export type SnapshotManualAsset = {
  value: number;
  is_debt: boolean;
  asset_class: "real_estate" | "equity_comp" | "529" | "other";
  tax_treatment: TaxTreatment;
};

export type SnapshotFigures = {
  total_assets: number;
  total_debts: number;
  net_worth: number;
  investable_assets: number;
  home_value: number;
  taxable_total: number;
  tax_advantaged_total: number;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Pure net-worth computation.
 *
 *   net_worth         = total_assets − total_debts
 *   investable_assets = total_assets − home_value
 *   taxable + tax_advantaged = investable_assets   (real estate excluded
 *                                                    from the tax split)
 */
export function computeNetWorth(
  accounts: SnapshotAccount[],
  manualAssets: SnapshotManualAsset[],
): SnapshotFigures {
  let totalAssets = 0;
  let totalDebts = 0;
  let homeValue = 0;
  let taxable = 0;
  let taxAdvantaged = 0;

  for (const acct of accounts) {
    const balance = acct.current_balance ?? 0;
    if (acct.is_debt) {
      totalDebts += balance;
      continue;
    }
    totalAssets += balance;
    if (effectiveTaxTreatment(acct) === "tax_advantaged") {
      taxAdvantaged += balance;
    } else {
      taxable += balance;
    }
  }

  for (const asset of manualAssets) {
    if (asset.is_debt) {
      totalDebts += asset.value;
      continue;
    }
    totalAssets += asset.value;
    if (asset.asset_class === "real_estate") {
      homeValue += asset.value;
    } else if (asset.tax_treatment === "tax_advantaged") {
      taxAdvantaged += asset.value;
    } else {
      taxable += asset.value;
    }
  }

  return {
    total_assets: round2(totalAssets),
    total_debts: round2(totalDebts),
    net_worth: round2(totalAssets - totalDebts),
    investable_assets: round2(totalAssets - homeValue),
    home_value: round2(homeValue),
    taxable_total: round2(taxable),
    tax_advantaged_total: round2(taxAdvantaged),
  };
}

/** Today's date in Pacific Time as YYYY-MM-DD (matches the daily cron's tz). */
export function pacificDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Compute the current figures for a user and upsert today's row in
 * net_worth_snapshots (one row per user per PT day). Returns the figures.
 */
export async function computeAndStoreSnapshot(
  userId: string,
): Promise<SnapshotFigures> {
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
    (accounts ?? []).map((a) => ({
      current_balance: a.current_balance == null ? null : Number(a.current_balance),
      is_debt: a.is_debt,
      type: a.type,
      subtype: a.subtype,
      name: a.name,
      tax_treatment: a.tax_treatment,
      tax_treatment_override: a.tax_treatment_override,
    })),
    (manualAssets ?? []).map((m) => ({
      value: Number(m.value),
      is_debt: m.is_debt,
      asset_class: m.asset_class,
      tax_treatment: m.tax_treatment,
    })),
  );

  const { error } = await admin.from("net_worth_snapshots").upsert(
    {
      user_id: userId,
      snapshot_date: pacificDate(),
      ...figures,
    },
    { onConflict: "user_id,snapshot_date" },
  );
  if (error) throw error;

  return figures;
}
