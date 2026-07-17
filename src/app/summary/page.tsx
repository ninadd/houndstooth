import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/dashboard/top-nav";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/format";
import type { DailySummary, SummaryDrivers } from "@/lib/daily-summary";
import { MoversSection } from "@/components/summary/movers-section";
import { SummaryHoldingsTable } from "@/components/summary/summary-holdings-table";
import { SummaryMarkSeen } from "@/components/summary/summary-mark-seen";

export default async function SummaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [summaryRes, snapshotsRes] = await Promise.all([
    supabase
      .from("daily_summaries")
      .select("summary_date, model, drivers")
      .order("summary_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Two most recent snapshots — day-over-day change for the stat tiles.
    supabase
      .from("net_worth_snapshots")
      .select("net_worth, investable_assets")
      .order("snapshot_date", { ascending: false })
      .limit(2),
  ]);

  const summary: DailySummary | null = summaryRes.data
    ? {
        date: summaryRes.data.summary_date,
        model: summaryRes.data.model,
        drivers: summaryRes.data.drivers as SummaryDrivers,
      }
    : null;

  const snaps = snapshotsRes.data ?? [];
  const dayChange = (latest: number, prev: number): TileChange | null =>
    prev !== 0 ? { amount: latest - prev, pct: ((latest - prev) / prev) * 100 } : null;
  const changes =
    snaps.length === 2
      ? {
          netWorth: dayChange(Number(snaps[0].net_worth), Number(snaps[1].net_worth)),
          investments: dayChange(
            Number(snaps[0].investable_assets),
            Number(snaps[1].investable_assets),
          ),
        }
      : { netWorth: null, investments: null };

  return (
    <div className="min-h-screen">
      <TopNav email={user.email ?? "account"} />

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <div className="space-y-1">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Daily summary
          </h1>
        </div>

        {summary ? (
          <SummaryBody summary={summary} changes={changes} />
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No summary yet. One is generated each day at ~1 PM PT once your
              accounts have synced.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

type TileChange = { amount: number; pct: number };

function SummaryBody({
  summary,
  changes,
}: {
  summary: DailySummary;
  changes: { netWorth: TileChange | null; investments: TileChange | null };
}) {
  const d = summary.drivers;
  const tickered = d.holdings.filter((h) => h.ticker);

  return (
    <>
      <SummaryMarkSeen date={summary.date} />

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-primary">
          {new Date(`${summary.date}T00:00:00`).toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </div>
        <h2 className="text-xl font-semibold leading-snug">{d.headline}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile
          label="Net Worth"
          value={formatCurrency(d.tiles.net_worth)}
          change={changes.netWorth}
        />
        <Tile
          label="Investments"
          value={formatCurrency(d.tiles.investments)}
          change={changes.investments}
        />
        <TopHoldingsTile holdings={d.holdings} />
      </div>

      <MoversSection holdings={d.holdings} />

      <Section title="Macro market">{d.macro_summary}</Section>
      <Section title="Portfolio drivers">{d.portfolio_summary}</Section>
      <Section title="What to watch">{d.watch}</Section>

      {tickered.length > 0 && (
        <div>
          <h3 className="mb-2 text-base font-semibold">Holdings</h3>
          <SummaryHoldingsTable holdings={tickered} />
        </div>
      )}
    </>
  );
}

/** The three largest positions by market value. */
function TopHoldingsTile({
  holdings,
}: {
  holdings: SummaryDrivers["holdings"];
}) {
  const top3 = [...holdings].sort((a, b) => b.value - a.value).slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <div className="col-span-2 rounded-xl border border-border p-4 sm:col-span-1">
      <h3 className="mb-3 text-base font-semibold">Top 3 holdings</h3>
      <ul className="space-y-1.5">
        {top3.map((h) => (
          <li
            key={`${h.ticker}-${h.name}`}
            className="flex items-baseline justify-between gap-2"
          >
            <span className="truncate text-sm font-medium">
              {h.ticker ?? h.name}
            </span>
            <span className="text-sm tabular-nums">
              {formatCurrency(h.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tile({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change?: TileChange | null;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="text-base font-semibold">{label}</h3>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {change && (
        <div className="mt-1 text-sm tabular-nums">
          <span className={change.amount >= 0 ? "text-gain" : "text-loss"}>
            {formatSignedCurrency(change.amount)} ({formatPercent(change.pct)})
          </span>{" "}
          <span className="text-muted-foreground">today</span>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
