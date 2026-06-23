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
  manual_category?: "property" | "debt" | "investment" | null;
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
 *   taxable + tax_advantaged = investable_assets   (real estate / manual
 *                                                    property excluded from
 *                                                    the tax split)
 */
export function computeNetWorth(accounts: SnapshotAccount[]): SnapshotFigures {
  let totalAssets = 0;
  let totalDebts = 0;
  let homeValue = 0;
  let taxable = 0;
  let taxAdvantaged = 0;

  for (const acct of accounts) {
    const balance = acct.current_balance ?? 0;
    if (acct.is_debt) {
      // Brokerages don't agree on sign for liability balances (e.g. a credit
      // card can report a negative `current_balance`); the UI always shows
      // debts as a positive magnitude (accounts-table.tsx), so match that
      // convention here rather than letting a negative balance silently
      // subtract from total debt.
      totalDebts += Math.abs(balance);
      continue;
    }
    totalAssets += balance;
    if (acct.manual_category === "property") {
      homeValue += balance;
    } else if (acct.manual_category === "investment") {
      // Manual investments use the user's explicit tax_treatment choice
      // directly rather than effectiveTaxTreatment, which would otherwise
      // re-derive from (null) type/subtype/name and could misfire on a label
      // like "Roth IRA".
      if (acct.tax_treatment === "tax_advantaged") {
        taxAdvantaged += balance;
      } else {
        taxable += balance;
      }
    } else if (effectiveTaxTreatment(acct) === "tax_advantaged") {
      taxAdvantaged += balance;
    } else {
      taxable += balance;
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
 * net_worth_snapshots (one row per user per PT day), plus one row per account
 * in account_balances for the per-account detail charts. Returns the figures.
 */
export async function computeAndStoreSnapshot(
  userId: string,
): Promise<SnapshotFigures> {
  const admin = createAdminClient();

  const { data: accounts } = await admin
    .from("accounts")
    .select(
      "id, current_balance, is_debt, type, subtype, name, tax_treatment, tax_treatment_override, manual_category",
    )
    .eq("user_id", userId);

  const figures = computeNetWorth(
    (accounts ?? []).map((a) => ({
      current_balance: a.current_balance == null ? null : Number(a.current_balance),
      is_debt: a.is_debt,
      type: a.type,
      subtype: a.subtype,
      name: a.name,
      tax_treatment: a.tax_treatment,
      tax_treatment_override: a.tax_treatment_override,
      manual_category: a.manual_category,
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

  const balanceRows = (accounts ?? []).map((a) => ({
    user_id: userId,
    account_id: a.id as string,
    balance_date: pacificDate(),
    balance: a.current_balance == null ? 0 : Number(a.current_balance),
  }));
  if (balanceRows.length > 0) {
    const { error: balanceError } = await admin
      .from("account_balances")
      .upsert(balanceRows, { onConflict: "account_id,balance_date" });
    if (balanceError) throw balanceError;
  }

  return figures;
}
