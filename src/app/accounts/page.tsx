import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/dashboard/top-nav";
import { AccountActions } from "@/components/dashboard/account-actions";
import {
  AccountsTable,
  type AccountRow,
} from "@/components/dashboard/accounts-table";
import type { ManualAccountRow } from "@/components/dashboard/manual-account-dialog";
import { ManualAccountActions } from "@/components/dashboard/manual-account-actions";
import { DailySummaryProvider } from "@/components/dashboard/daily-summary-context";
import { Card, CardContent } from "@/components/ui/card";

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("accounts")
    .select(
      "id, name, custom_name, official_name, type, subtype, tax_treatment, tax_treatment_override, is_debt, current_balance, mask, is_manual, manual_category, connections(institution_name)",
    )
    .order("current_balance", { ascending: false, nullsFirst: false });

  const baseAccounts: AccountRow[] = (data ?? []).map((a) => {
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
      is_manual: a.is_manual,
      manual_category: a.manual_category,
    };
  });

  const syncedAccounts = baseAccounts.filter((a) => !a.is_manual);
  const manualBase = baseAccounts.filter((a) => a.is_manual);

  // Manual investment accounts can carry several holdings — fetch all of
  // them (not just one) so the edit dialog can prefill the full list.
  const manualIds = manualBase.map((a) => a.id);
  const { data: manualHoldings } =
    manualIds.length > 0
      ? await supabase
          .from("holdings")
          .select("account_id, quantity, cost_basis, securities(ticker)")
          .in("account_id", manualIds)
      : { data: [] };

  const holdingsByAccount = new Map<
    string,
    { ticker: string | null; units: number | null; cost_basis: number | null }[]
  >();
  for (const h of manualHoldings ?? []) {
    const sec = h.securities as { ticker: string | null } | { ticker: string | null }[] | null;
    const ticker = (Array.isArray(sec) ? sec[0] : sec)?.ticker ?? null;
    const accountId = h.account_id as string;
    const list = holdingsByAccount.get(accountId) ?? [];
    list.push({
      ticker,
      units: h.quantity == null ? null : Number(h.quantity),
      cost_basis: h.cost_basis == null ? null : Number(h.cost_basis),
    });
    holdingsByAccount.set(accountId, list);
  }

  const manualAccounts: ManualAccountRow[] = manualBase.map((a) => ({
    ...a,
    holdings: holdingsByAccount.get(a.id) ?? [],
  }));

  const hasSyncedAccounts = syncedAccounts.length > 0;
  const hasManualAccounts = manualAccounts.length > 0;

  return (
    <DailySummaryProvider summary={null}>
      <div className="min-h-screen">
        <TopNav email={user.email ?? "account"} />

        <main className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6">
          <div className="space-y-1">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Synced accounts</h2>
              <AccountActions hasAccounts={hasSyncedAccounts} />
            </div>

            {hasSyncedAccounts ? (
              <AccountsTable accounts={syncedAccounts} showBalance={false} editable />
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No accounts yet. Connect a brokerage with SnapTrade to pull in
                  balances and holdings.
                </CardContent>
              </Card>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">
                Manually linked accounts
              </h2>
              <ManualAccountActions />
            </div>

            {hasManualAccounts ? (
              <AccountsTable accounts={manualAccounts} showBalance={false} editable />
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No manually added accounts yet.
                </CardContent>
              </Card>
            )}
          </section>
        </main>
      </div>
    </DailySummaryProvider>
  );
}
