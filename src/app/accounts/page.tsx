import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/dashboard/top-nav";
import { AccountActions } from "@/components/dashboard/account-actions";
import {
  AccountsTable,
  type AccountRow,
} from "@/components/dashboard/accounts-table";
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
      "id, name, custom_name, official_name, type, subtype, tax_treatment, tax_treatment_override, is_debt, current_balance, mask, connections(institution_name)",
    )
    .order("current_balance", { ascending: false, nullsFirst: false });

  const accounts: AccountRow[] = (data ?? []).map((a) => {
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

  const hasAccounts = accounts.length > 0;

  return (
    <DailySummaryProvider summary={null}>
      <div className="min-h-screen">
        <TopNav email={user.email ?? "account"} />

        <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Link
                href="/"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Dashboard
              </Link>
              <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
            </div>
            <AccountActions hasAccounts={hasAccounts} />
          </div>

          {hasAccounts ? (
            <AccountsTable accounts={accounts} showBalance={false} editable />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No accounts yet. Connect a brokerage with SnapTrade to pull in
                balances and holdings.
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </DailySummaryProvider>
  );
}
