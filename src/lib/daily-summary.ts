import { createAdminClient } from "@/lib/supabase/admin";
import { pacificDate, type SnapshotFigures } from "@/lib/snapshot";
import {
  buildGeminiContext,
  buildHoldingsReport,
  type HoldingsReport,
} from "@/lib/holdings-report";
import { generateSummary, type SummaryResult } from "@/lib/gemini";

export type SummaryHolding = {
  ticker: string | null;
  name: string | null;
  sector: string | null;
  value: number;
  changePct: number | null;
  direction: "up" | "down" | "flat";
  isMover: boolean;
  reason: string | null;
};

/** Self-contained record rendered by the /summary page. */
export type SummaryDrivers = {
  headline: string;
  tiles: { net_worth: number; investments: number };
  macro_summary: string;
  portfolio_summary: string;
  watch: string;
  holdings: SummaryHolding[];
  generatedAt: string;
};

/** The latest stored summary, as loaded from daily_summaries. */
export type DailySummary = {
  date: string;
  model: string | null;
  drivers: SummaryDrivers;
};

type LatestSnapshot = { id: string; figures: SnapshotFigures };

async function loadLatestSnapshot(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<LatestSnapshot | null> {
  const { data } = await admin
    .from("net_worth_snapshots")
    .select(
      "id, total_assets, total_debts, net_worth, investable_assets, home_value, taxable_total, tax_advantaged_total",
    )
    .eq("user_id", userId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    figures: {
      total_assets: Number(data.total_assets),
      total_debts: Number(data.total_debts),
      net_worth: Number(data.net_worth),
      investable_assets: Number(data.investable_assets),
      home_value: Number(data.home_value),
      taxable_total: Number(data.taxable_total),
      tax_advantaged_total: Number(data.tax_advantaged_total),
    },
  };
}

function mergeHoldings(
  report: HoldingsReport,
  result: SummaryResult,
): SummaryHolding[] {
  const reasonByTicker = new Map(
    result.movers.map((m) => [m.ticker.toUpperCase(), m.reason]),
  );
  return report.rows.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    sector: r.sector,
    value: r.value,
    changePct: r.changePct,
    direction: r.direction,
    isMover: r.isMover,
    reason: r.ticker ? (reasonByTicker.get(r.ticker.toUpperCase()) ?? null) : null,
  }));
}

function toMarkdown(d: SummaryDrivers): string {
  return [
    `## ${d.headline}`,
    "",
    `**Macro market**\n\n${d.macro_summary}`,
    "",
    `**Portfolio drivers**\n\n${d.portfolio_summary}`,
    "",
    `**What to watch**\n\n${d.watch}`,
  ].join("\n");
}

/**
 * Generate (and persist) today's daily summary for a user. One row per PT day
 * in daily_summaries (idempotent). With `mock: true` it skips Gemini and
 * produces canned text — used to exercise the UI without an API key.
 */
export async function generateDailySummary(
  userId: string,
  opts: { mock?: boolean } = {},
): Promise<{ ok: true; date: string } | { ok: false; reason: string }> {
  const admin = createAdminClient();
  const date = pacificDate();

  const snapshot = await loadLatestSnapshot(admin, userId);
  if (!snapshot) return { ok: false, reason: "no_snapshot" };

  const report = await buildHoldingsReport(userId);

  let result: SummaryResult;
  let model: string;
  if (opts.mock) {
    ({ result, model } = mockSummary(report));
  } else {
    const ctx = buildGeminiContext(report, snapshot.figures, date);
    ({ result, model } = await generateSummary(ctx));
  }

  const drivers: SummaryDrivers = {
    headline: result.headline,
    tiles: {
      net_worth: snapshot.figures.net_worth,
      investments: snapshot.figures.investable_assets,
    },
    macro_summary: result.macro_summary,
    portfolio_summary: result.portfolio_summary,
    watch: result.watch,
    holdings: mergeHoldings(report, result),
    generatedAt: new Date().toISOString(),
  };

  const { error } = await admin.from("daily_summaries").upsert(
    {
      user_id: userId,
      summary_date: date,
      content: toMarkdown(drivers),
      drivers,
      model,
      snapshot_id: snapshot.id,
    },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, reason: error.message };

  return { ok: true, date };
}

/** Canned summary for UI testing without calling Gemini. */
function mockSummary(report: HoldingsReport): {
  result: SummaryResult;
  model: string;
} {
  return {
    model: "mock",
    result: {
      headline: "Quiet, range-bound session with tech holding the line",
      macro_summary:
        "Broad indices finished little changed as markets digested the latest rate commentary. Treasury yields eased slightly while energy lagged on softer crude.",
      portfolio_summary:
        "Your tech-tilted exposure was the main support, offsetting modest weakness in cyclical names. Sector breadth was narrow, so a few positions drove most of the day's move.",
      watch:
        "Watch upcoming inflation data and Fed speakers for direction on rate expectations, plus any sector-specific earnings on deck.",
      movers: report.movers.map((m) => ({
        ticker: m.ticker ?? "",
        reason:
          m.direction === "up"
            ? "Outperformed alongside sector strength and steady demand signals."
            : "Pulled back with its sector amid softer macro sentiment.",
      })),
    },
  };
}
