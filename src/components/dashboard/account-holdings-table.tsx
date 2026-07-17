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
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/format";

export type AccountHoldingRow = {
  securityId: string;
  ticker: string | null;
  name: string | null;
  value: number;
  quantity: number | null;
  /** Total cost basis for the position (not per-share). */
  costBasis: number | null;
};

type SortColumn = "holding" | "units" | "costBasis" | "value" | "gain";

/** Display label for a holding, preferring the ticker over the security name. */
function displayLabel(h: AccountHoldingRow): string {
  return h.ticker ?? h.name ?? "Holding";
}

/** Dollar + percent gain/loss vs. cost basis, or null when cost basis is unknown. */
function gain(h: AccountHoldingRow): { amount: number; pct: number } | null {
  if (h.costBasis == null || h.costBasis === 0) return null;
  const amount = h.value - h.costBasis;
  return { amount, pct: (amount / h.costBasis) * 100 };
}

function formatUnits(quantity: number | null): string {
  if (quantity == null) return "—";
  return quantity.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function AccountHoldingsTable({
  holdings,
}: {
  holdings: AccountHoldingRow[];
}) {
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir }>({
    column: "value",
    dir: "desc",
  });

  function toggleSort(column: SortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column, dir: column === "value" ? "desc" : "asc" },
    );
  }

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const rows = [...holdings];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sort.column) {
        case "holding":
          cmp = displayLabel(a).localeCompare(displayLabel(b));
          break;
        case "units":
          cmp = (a.quantity ?? 0) - (b.quantity ?? 0);
          break;
        case "costBasis":
          cmp = (a.costBasis ?? 0) - (b.costBasis ?? 0);
          break;
        case "value":
          cmp = a.value - b.value;
          break;
        case "gain":
          cmp = (gain(a)?.amount ?? 0) - (gain(b)?.amount ?? 0);
          break;
      }
      if (cmp === 0) cmp = displayLabel(a).localeCompare(displayLabel(b));
      return cmp * dir;
    });
    return rows;
  }, [holdings, sort]);

  return (
    <div className="rounded-xl border border-border">
      <Table className="sm:table-fixed">
        <TableHeader>
          <TableRow>
            <SortHeader
              column="holding"
              label="Holding"
              sort={sort}
              onSort={toggleSort}
              className="sm:w-1/5"
            />
            <SortHeader
              column="units"
              label="Units"
              sort={sort}
              onSort={toggleSort}
              align="right"
              className="hidden sm:table-cell sm:w-1/5"
            />
            <SortHeader
              column="costBasis"
              label="Cost basis"
              sort={sort}
              onSort={toggleSort}
              align="right"
              className="hidden sm:table-cell sm:w-1/5"
            />
            <SortHeader
              column="value"
              label="Value"
              sort={sort}
              onSort={toggleSort}
              align="right"
              className="sm:w-1/5"
            />
            <SortHeader
              column="gain"
              label="Gain/Loss"
              sort={sort}
              onSort={toggleSort}
              align="right"
              className="sm:w-1/5"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((h) => {
            const g = gain(h);
            return (
              <TableRow key={h.securityId}>
                <TableCell>
                  <div className="font-medium">{h.ticker ?? "Cash"}</div>
                  {h.name && (
                    <div className="truncate text-xs text-muted-foreground">
                      {h.name}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatUnits(h.quantity)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {h.costBasis == null ? "—" : formatCurrency(h.costBasis)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(h.value)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {g == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={g.amount >= 0 ? "text-gain" : "text-loss"}>
                      {formatSignedCurrency(g.amount)} ({formatPercent(g.pct)})
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
