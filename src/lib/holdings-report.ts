import { createAdminClient } from "@/lib/supabase/admin";
import type { SnapshotFigures } from "@/lib/snapshot";

export type HoldingReportRow = {
  securityId: string;
  ticker: string | null;
  name: string | null;
  sector: string | null;
  /** Current market value (USD). Shown to the user; never sent to Gemini. */
  value: number;
  /** Day-over-day change %, or null when there's no prior close. */
  changePct: number | null;
  direction: "up" | "down" | "flat";
  isMover: boolean;
};

export type HoldingsReport = {
  rows: HoldingReportRow[];
  portfolioValue: number;
  sectorWeights: { sector: string; weightPct: number }[];
  movers: HoldingReportRow[];
};

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/**
 * Build the per-holding report: current value + day-over-day % change, plus
 * sector weights and the set of notable movers. Reads dollar values for display
 * to the user — these are NOT passed to Gemini (see buildGeminiContext).
 */
export async function buildHoldingsReport(
  userId: string,
): Promise<HoldingsReport> {
  const admin = createAdminClient();

  const { data: holdings } = await admin
    .from("holdings")
    .select(
      "institution_value, security_id, securities(ticker, name, sector, is_cash_equivalent)",
    )
    .eq("user_id", userId);

  // Aggregate holdings of the same security across accounts.
  const bySecurity = new Map<
    string,
    {
      ticker: string | null;
      name: string | null;
      sector: string | null;
      isCash: boolean;
      value: number;
    }
  >();

  for (const h of holdings ?? []) {
    const rel = h.securities as
      | { ticker: string | null; name: string | null; sector: string | null; is_cash_equivalent: boolean }
      | { ticker: string | null; name: string | null; sector: string | null; is_cash_equivalent: boolean }[]
      | null;
    const sec = Array.isArray(rel) ? rel[0] : rel;
    if (!sec) continue;
    const value = h.institution_value == null ? 0 : Number(h.institution_value);
    const existing = bySecurity.get(h.security_id);
    if (existing) {
      existing.value += value;
    } else {
      bySecurity.set(h.security_id, {
        ticker: sec.ticker,
        name: sec.name,
        sector: sec.sector,
        isCash: sec.is_cash_equivalent,
        value,
      });
    }
  }

  // Day-over-day change from the two most recent close prices per security.
  const securityIds = [...bySecurity.keys()];
  const changeBySecurity = new Map<string, number | null>();
  if (securityIds.length > 0) {
    const { data: prices } = await admin
      .from("security_prices")
      .select("security_id, price_date, close_price")
      .eq("user_id", userId)
      .in("security_id", securityIds)
      .order("price_date", { ascending: false });

    const grouped = new Map<string, number[]>();
    for (const p of prices ?? []) {
      if (p.close_price == null) continue;
      const arr = grouped.get(p.security_id) ?? [];
      if (arr.length < 2) arr.push(Number(p.close_price));
      grouped.set(p.security_id, arr);
    }
    for (const id of securityIds) {
      const arr = grouped.get(id);
      if (arr && arr.length === 2 && arr[1] !== 0) {
        changeBySecurity.set(id, round(((arr[0] - arr[1]) / arr[1]) * 100, 2));
      } else {
        changeBySecurity.set(id, null);
      }
    }
  }

  const rows: HoldingReportRow[] = [];
  let portfolioValue = 0;
  for (const [securityId, s] of bySecurity) {
    portfolioValue += s.value;
    const changePct = changeBySecurity.get(securityId) ?? null;
    rows.push({
      securityId,
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      value: round(s.value),
      changePct,
      direction:
        changePct == null || changePct === 0
          ? "flat"
          : changePct > 0
            ? "up"
            : "down",
      isMover: false,
    });
  }

  // Sector weights (ratios only — safe to share with Gemini).
  const sectorTotals = new Map<string, number>();
  for (const r of rows) {
    const sector = r.sector ?? "Other";
    sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + r.value);
  }
  const sectorWeights = [...sectorTotals.entries()]
    .map(([sector, total]) => ({
      sector,
      weightPct: portfolioValue > 0 ? round((total / portfolioValue) * 100, 1) : 0,
    }))
    .sort((a, b) => b.weightPct - a.weightPct);

  // Movers: largest absolute moves among holdings with a known change.
  const moveable = rows.filter((r) => r.changePct != null && r.ticker);
  moveable.sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!));
  const movers = moveable
    .filter((r) => Math.abs(r.changePct!) >= 0.25)
    .slice(0, 6);
  for (const m of movers) m.isMover = true;

  rows.sort((a, b) => b.value - a.value);

  return { rows, portfolioValue: round(portfolioValue), sectorWeights, movers };
}

// ---------------------------------------------------------------------------
// Privacy sanitizer — the ONLY portfolio data that may reach Gemini.
// Contains ratios (%), tickers, sectors, and per-ticker % moves. It must never
// contain dollar balances, share quantities, or position values.
// ---------------------------------------------------------------------------

export type GeminiContext = {
  date: string;
  taxSplitPct: { taxable: number; taxAdvantaged: number };
  sectorWeights: { sector: string; weightPct: number }[];
  holdings: { ticker: string; name: string | null; sector: string | null; changePct: number | null }[];
  movers: { ticker: string; direction: "up" | "down" | "flat"; changePct: number }[];
};

export function buildGeminiContext(
  report: HoldingsReport,
  figures: SnapshotFigures,
  date: string,
): GeminiContext {
  const investable = figures.taxable_total + figures.tax_advantaged_total;
  const pct = (n: number) => (investable > 0 ? round((n / investable) * 100, 1) : 0);

  return {
    date,
    taxSplitPct: {
      taxable: pct(figures.taxable_total),
      taxAdvantaged: pct(figures.tax_advantaged_total),
    },
    sectorWeights: report.sectorWeights,
    holdings: report.rows
      .filter((r) => r.ticker)
      .map((r) => ({
        ticker: r.ticker!,
        name: r.name,
        sector: r.sector,
        changePct: r.changePct,
      })),
    movers: report.movers.map((m) => ({
      ticker: m.ticker!,
      direction: m.direction,
      changePct: m.changePct!,
    })),
  };
}
