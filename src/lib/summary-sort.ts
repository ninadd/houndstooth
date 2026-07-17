import type { SummaryHolding } from "@/lib/daily-summary";

export type SummarySortColumn = "holding" | "value" | "change";
export type SummarySortDir = "asc" | "desc";

export function holdingLabel(h: SummaryHolding): string {
  return h.ticker ?? h.name ?? "Holding";
}

/**
 * Sort holdings for the summary table. Rows without a day change always sink
 * to the bottom when sorting by change, regardless of direction.
 */
export function sortSummaryHoldings(
  rows: SummaryHolding[],
  sort: { column: SummarySortColumn; dir: SummarySortDir },
): SummaryHolding[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sort.column === "change") {
      const aNull = a.changePct == null;
      const bNull = b.changePct == null;
      if (aNull || bNull) {
        if (aNull && bNull) return holdingLabel(a).localeCompare(holdingLabel(b));
        return aNull ? 1 : -1;
      }
      const cmp = a.changePct! - b.changePct!;
      return cmp === 0
        ? holdingLabel(a).localeCompare(holdingLabel(b))
        : cmp * dir;
    }
    let cmp = 0;
    switch (sort.column) {
      case "holding":
        cmp = holdingLabel(a).localeCompare(holdingLabel(b));
        break;
      case "value":
        cmp = a.value - b.value;
        break;
    }
    if (cmp === 0) cmp = holdingLabel(a).localeCompare(holdingLabel(b));
    return cmp * dir;
  });
  return sorted;
}
