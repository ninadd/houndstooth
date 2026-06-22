import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountActions } from "@/components/dashboard/account-actions";
import { TopNav } from "@/components/dashboard/top-nav";
import { HeroCharts, type HeroPoint } from "@/components/dashboard/hero-charts";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import {
  ManualAssetsCard,
  type ManualAsset,
} from "@/components/dashboard/manual-assets";
import {
  AccountsTable,
  type AccountRow,
} from "@/components/dashboard/accounts-table";
import {
  DailySummaryBanner,
  type DailySummary,
} from "@/components/dashboard/daily-summary";
import { Card, CardContent } from "@/components/ui/card";
import type { SnapshotFigures } from "@/lib/snapshot";
import type { SummaryDrivers } from "@/lib/daily-summary";

const ZERO_FIGURES: SnapshotFigures = {
  total_assets: 0,
  total_debts: 0,
  net_worth: 0,
  investable_assets: 0,
  home_value: 0,
  taxable_total: 0,
  tax_advantaged_total: 0,
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [accountsRes, manualRes, snapshotsRes, summaryRes] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, name, custom_name, official_name, type, subtype, tax_treatment, tax_treatment_override, is_debt, current_balance, mask, connections(institution_name)",
      )
      .order("current_balance", { ascending: false, nullsFirst: false }),
    supabase
      .from("manual_assets")
      .select("id, label, asset_class, value, is_debt, tax_treatment")
      .order("value", { ascending: false }),
    supabase
      .from("net_worth_snapshots")
      .select(
        "snapshot_date, total_assets, total_debts, net_worth, investable_assets, home_value, taxable_total, tax_advantaged_total",
      )
      .order("snapshot_date", { ascending: true }),
    supabase
      .from("daily_summaries")
      .select("summary_date, model, drivers")
      .order("summary_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const accounts: AccountRow[] = (accountsRes.data ?? []).map((a) => {
    const rel = a.connections as
      | { institution_name: string | null }
      | { institution_name: string | null }[]
      | null;
    const item = Array.isArray(rel) ? (rel[0] ?? null) : rel;
    return {
      id: a.id,
      name: a.name,
      custom_name: a.custom_name ?? null,
      official_name: a.official_name,
      type: a.type,
      subtype: a.subtype,
      tax_treatment: a.tax_treatment,
      tax_treatment_override: a.tax_treatment_override,
      is_debt: a.is_debt,
      current_balance:
        a.current_balance == null ? null : Number(a.current_balance),
      mask: a.mask,
      institution_name: item?.institution_name ?? null,
    };
  });

  const manualAssets: ManualAsset[] = (manualRes.data ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    asset_class: m.asset_class,
    value: Number(m.value),
    is_debt: m.is_debt,
    tax_treatment: m.tax_treatment,
  }));

  const snapshots = snapshotsRes.data ?? [];
  const series: HeroPoint[] = snapshots.map((s) => ({
    date: s.snapshot_date,
    netWorth: Number(s.net_worth),
    investments: Number(s.investable_assets),
  }));

  const lastSnapshot = snapshots.at(-1);
  const figures: SnapshotFigures = lastSnapshot
    ? {
        total_assets: Number(lastSnapshot.total_assets),
        total_debts: Number(lastSnapshot.total_debts),
        net_worth: Number(lastSnapshot.net_worth),
        investable_assets: Number(lastSnapshot.investable_assets),
        home_value: Number(lastSnapshot.home_value),
        taxable_total: Number(lastSnapshot.taxable_total),
        tax_advantaged_total: Number(lastSnapshot.tax_advantaged_total),
      }
    : ZERO_FIGURES;

  const hasAccounts = accounts.length > 0;

  const summary: DailySummary | null = summaryRes.data
    ? {
        date: summaryRes.data.summary_date,
        model: summaryRes.data.model,
        drivers: summaryRes.data.drivers as SummaryDrivers,
      }
    : null;

  return (
    <div className="min-h-screen">
      <TopNav email={user.email ?? "account"} />

      <main className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6">
        <DailySummaryBanner summary={summary} />

        <HeroCharts
          series={series}
          latest={{
            netWorth: figures.net_worth,
            investments: figures.investable_assets,
          }}
        />

        <SummaryCards figures={figures} />

        <ManualAssetsCard assets={manualAssets} />

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Accounts</h2>
            <AccountActions hasAccounts={hasAccounts} syncOnly />
          </div>

          {hasAccounts ? (
            <AccountsTable accounts={accounts} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No accounts yet. Connect a brokerage with SnapTrade to pull in
                balances and holdings.
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}
