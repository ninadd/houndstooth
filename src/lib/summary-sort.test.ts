import { describe, expect, it } from "vitest";
import { sortSummaryHoldings } from "./summary-sort";
import type { SummaryHolding } from "./daily-summary";

const holding = (o: Partial<SummaryHolding>): SummaryHolding => ({
  ticker: "AAPL",
  name: "Apple Inc.",
  sector: null,
  value: 1000,
  changePct: 1.5,
  direction: "up",
  isMover: false,
  reason: null,
  ...o,
});

const rows: SummaryHolding[] = [
  holding({ ticker: "AAPL", value: 1000, changePct: 1.5 }),
  holding({ ticker: "XOM", value: 500, changePct: -2.1, direction: "down" }),
  holding({ ticker: "MMKT", value: 2000, changePct: null, direction: "flat" }),
  holding({ ticker: "NVDA", value: 300, changePct: 4.2 }),
];

describe("sortSummaryHoldings", () => {
  it("sorts by change desc with null-change rows last", () => {
    const sorted = sortSummaryHoldings(rows, { column: "change", dir: "desc" });
    expect(sorted.map((r) => r.ticker)).toEqual(["NVDA", "AAPL", "XOM", "MMKT"]);
  });

  it("keeps null-change rows last when ascending too", () => {
    const sorted = sortSummaryHoldings(rows, { column: "change", dir: "asc" });
    expect(sorted.map((r) => r.ticker)).toEqual(["XOM", "AAPL", "NVDA", "MMKT"]);
  });

  it("tiebreaks equal changes by label", () => {
    const tied = [
      holding({ ticker: "ZZZ", changePct: 1.0 }),
      holding({ ticker: "AAA", changePct: 1.0 }),
    ];
    const sorted = sortSummaryHoldings(tied, { column: "change", dir: "desc" });
    expect(sorted.map((r) => r.ticker)).toEqual(["AAA", "ZZZ"]);
  });

  it("sorts by value", () => {
    const sorted = sortSummaryHoldings(rows, { column: "value", dir: "desc" });
    expect(sorted.map((r) => r.ticker)).toEqual(["MMKT", "AAPL", "XOM", "NVDA"]);
  });

  it("sorts by holding label", () => {
    const sorted = sortSummaryHoldings(rows, { column: "holding", dir: "asc" });
    expect(sorted.map((r) => r.ticker)).toEqual(["AAPL", "MMKT", "NVDA", "XOM"]);
  });

  it("does not mutate the input array", () => {
    const before = rows.map((r) => r.ticker);
    sortSummaryHoldings(rows, { column: "change", dir: "desc" });
    expect(rows.map((r) => r.ticker)).toEqual(before);
  });
});
