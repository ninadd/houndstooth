import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/dashboard/top-nav";
import { SingleHeroChart, type SinglePoint } from "@/components/dashboard/hero-charts";
import {
  AccountHoldingsTable,
  type AccountHoldingRow,
} from "@/components/dashboard/account-holdings-table";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [accountRes, holdingsRes, balancesRes] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, custom_name, current_balance, mask, connections(institution_name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("holdings")
      .select("security_id, quantity, cost_basis, institution_value, securities(ticker, name)")
      .eq("account_id", id),
    supabase
      .from("account_balances")
      .select("balance_date, balance")
      .eq("account_id", id)
      .order("balance_date", { ascending: true }),
  ]);

  const account = accountRes.data;
  if (!account) notFound();

  const rel = account.connections as
    | { institution_name: string | null }
    | { institution_name: string | null }[]
    | null;
  const institution = (Array.isArray(rel) ? rel[0] : rel)?.institution_name ?? null;

  const title = account.custom_name ?? account.name;
  const current = account.current_balance == null ? 0 : Number(account.current_balance);

  const holdings: AccountHoldingRow[] = (holdingsRes.data ?? []).map((h) => {
    const secRel = h.securities as
      | { ticker: string | null; name: string | null }
      | { ticker: string | null; name: string | null }[]
      | null;
    const sec = Array.isArray(secRel) ? secRel[0] : secRel;
    return {
      securityId: h.security_id,
      ticker: sec?.ticker ?? null,
      name: sec?.name ?? null,
      value: h.institution_value == null ? 0 : Number(h.institution_value),
      quantity: h.quantity == null ? null : Number(h.quantity),
      costBasis: h.cost_basis == null ? null : Number(h.cost_basis),
    };
  });

  const series: SinglePoint[] = (balancesRes.data ?? []).map((b) => ({
    date: b.balance_date,
    value: Number(b.balance),
  }));

  return (
    <div className="min-h-screen">
      <TopNav email={user.email ?? "account"} />

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <div className="space-y-1">
          <Link
            href="/accounts"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Accounts
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {(institution || account.mask) && (
            <p className="text-sm text-muted-foreground">
              {institution ?? "—"}
              {account.mask ? ` ••${account.mask}` : ""}
            </p>
          )}
        </div>

        <SingleHeroChart series={series} current={current} title="Value" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Holdings</h2>
          {holdings.length > 0 ? (
            <AccountHoldingsTable holdings={holdings} />
          ) : (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No holdings in this account.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
