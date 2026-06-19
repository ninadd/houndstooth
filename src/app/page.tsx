import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/dashboard/top-nav";
import { HeroCharts } from "@/components/dashboard/hero-charts";
import { AllocationCards } from "@/components/dashboard/allocation-cards";
import { AccountActions } from "@/components/dashboard/account-actions";
import {
  AccountsTable,
  type AccountRow,
} from "@/components/dashboard/accounts-table";
import { Card, CardContent } from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already guards this, but be defensive.
  if (!user) redirect("/login");

  const { data: rawAccounts } = await supabase
    .from("accounts")
    .select(
      "id, name, official_name, type, subtype, tax_treatment, tax_treatment_override, is_debt, current_balance, mask, plaid_items(institution_name)",
    )
    .order("current_balance", { ascending: false, nullsFirst: false });

  const accounts: AccountRow[] = (rawAccounts ?? []).map((a) => {
    // Many-to-one embed: PostgREST returns an object at runtime, but the
    // inferred type can be an array. Normalize either shape.
    const rel = a.plaid_items as
      | { institution_name: string | null }
      | { institution_name: string | null }[]
      | null;
    const item = Array.isArray(rel) ? (rel[0] ?? null) : rel;
    return {
      id: a.id,
      name: a.name,
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
    <div className="min-h-screen">
      <TopNav email={user.email ?? "account"} />

      <main className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6">
        <HeroCharts />

        <AllocationCards />

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Accounts</h2>
            <AccountActions hasAccounts={hasAccounts} />
          </div>

          {hasAccounts ? (
            <AccountsTable accounts={accounts} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No accounts yet. Connect an institution with Plaid to pull in
                balances and holdings.
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}
