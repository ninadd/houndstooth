import { describe, expect, it } from "vitest";
import {
  buildGeminiContext,
  type HoldingsReport,
  type HoldingReportRow,
} from "./holdings-report";
import type { SnapshotFigures } from "./snapshot";

const row = (o: Partial<HoldingReportRow>): HoldingReportRow => ({
  securityId: "s1",
  ticker: "AAPL",
  name: "Apple Inc.",
  sector: "Technology",
  value: 123456.78,
  changePct: 1.5,
  direction: "up",
  isMover: true,
  ...o,
});

const figures: SnapshotFigures = {
  total_assets: 1_000_000,
  total_debts: 0,
  net_worth: 1_000_000,
  investable_assets: 800_000,
  home_value: 200_000,
  taxable_total: 500_000,
  tax_advantaged_total: 300_000,
};

const report: HoldingsReport = {
  rows: [
    row({ securityId: "s1", ticker: "AAPL", value: 123456.78, changePct: 1.5 }),
    row({
      securityId: "s2",
      ticker: "XOM",
      name: "Exxon",
      sector: "Energy",
      value: 98765.43,
      changePct: -2.1,
      direction: "down",
    }),
  ],
  portfolioValue: 222222.21,
  sectorWeights: [
    { sector: "Technology", weightPct: 55.6 },
    { sector: "Energy", weightPct: 44.4 },
  ],
  movers: [row({ ticker: "XOM", value: 98765.43, changePct: -2.1, direction: "down" })],
};

describe("buildGeminiContext (privacy sanitizer)", () => {
  const ctx = buildGeminiContext(report, figures, "2026-06-19");
  const serialized = JSON.stringify(ctx);

  it("never leaks dollar values or quantities", () => {
    // No position values, portfolio value, or net-worth dollars present.
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("98765");
    expect(serialized).not.toContain("222222");
    expect(serialized).not.toContain("1000000");
    expect(serialized).not.toContain("800000");
    // The object must not carry any "value"/balance keys.
    expect(serialized).not.toMatch(/"value"|"balance"|"quantity"|"amount"/);
  });

  it("includes the de-identified signal Gemini needs", () => {
    expect(ctx.holdings.map((h) => h.ticker)).toContain("AAPL");
    expect(ctx.movers[0]).toMatchObject({ ticker: "XOM", direction: "down" });
    expect(ctx.taxSplitPct.taxable).toBeCloseTo(62.5); // 500k / 800k
    expect(ctx.taxSplitPct.taxAdvantaged).toBeCloseTo(37.5);
    expect(ctx.sectorWeights.length).toBe(2);
  });
});
