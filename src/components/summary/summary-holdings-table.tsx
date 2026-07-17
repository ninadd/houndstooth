"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortHeader, type SortDir } from "@/components/ui/sort-header";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { SummaryHolding } from "@/lib/daily-summary";
import {
  sortSummaryHoldings,
  type SummarySortColumn,
} from "@/lib/summary-sort";

export function SummaryHoldingsTable({
  holdings,
}: {
  holdings: SummaryHolding[];
}) {
  const [sort, setSort] = useState<{ column: SummarySortColumn; dir: SortDir }>({
    column: "change",
    dir: "desc",
  });

  function toggleSort(column: SummarySortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column, dir: column === "holding" ? "asc" : "desc" },
    );
  }

  const sorted = useMemo(
    () => sortSummaryHoldings(holdings, sort),
    [holdings, sort],
  );

  return (
    <div className="rounded-xl border border-border">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <SortHeader
              column="holding"
              label="Holding"
              sort={sort}
              onSort={toggleSort}
              className="w-2/5"
            />
            <SortHeader
              column="value"
              label="Value"
              sort={sort}
              onSort={toggleSort}
              align="right"
              className="w-[30%]"
            />
            <SortHeader
              column="change"
              label="Change"
              sort={sort}
              onSort={toggleSort}
              align="right"
              className="w-[30%]"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((h) => (
            <TableRow key={`${h.ticker}-${h.name}`}>
              <TableCell>
                <div className="font-medium">{h.ticker}</div>
                {h.name && (
                  <div className="truncate text-xs text-muted-foreground">
                    {h.name}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatCurrency(h.value)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {h.changePct == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span
                    className={
                      h.changePct > 0
                        ? "text-gain"
                        : h.changePct < 0
                          ? "text-loss"
                          : undefined
                    }
                  >
                    {formatPercent(h.changePct)}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
