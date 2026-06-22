"use client";

import { useMemo, useState } from "react";
import { Area, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { projectPortfolio, type ProjectionPoint } from "@/lib/projection";

type HorizonKey = "10y" | "20y" | "30y" | "40y";

const HORIZONS: { key: HorizonKey; label: string; years: number }[] = [
  { key: "10y", label: "10Y", years: 10 },
  { key: "20y", label: "20Y", years: 20 },
  { key: "30y", label: "30Y", years: 30 },
  { key: "40y", label: "40Y", years: 40 },
];

const LEGEND = [
  { key: "bull", label: "Bull 6%", color: "var(--gain)" },
  { key: "base", label: "Base 4%", color: "var(--muted-foreground)" },
  { key: "bear", label: "Bear 2%", color: "var(--loss)" },
] as const;

export function ProjectedPortfolioChart({ currentValue }: { currentValue: number }) {
  const [horizon, setHorizon] = useState<HorizonKey>("20y");
  const horizonDef = HORIZONS.find((h) => h.key === horizon)!;
  const hasData = currentValue > 0;

  const data = useMemo(
    () => projectPortfolio(currentValue, horizonDef.years),
    [currentValue, horizonDef],
  );

  return (
    <div className="rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">
          Projected portfolio value
        </div>
        <div className="flex items-center gap-3">
          {LEGEND.map((l) => (
            <div key={l.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: l.color }} aria-hidden />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 h-64 w-full">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="fill-bear" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--loss)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--loss)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fill-base" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--muted-foreground)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--muted-foreground)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fill-bull" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gain)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--gain)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="year"
                tickFormatter={(y: number) => `${y}y`}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickMargin={8}
                interval="preserveStartEnd"
              />
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip content={<ProjectionTooltip />} />
              {/* Stacked bands (bear, then base-above-bear, then bull-above-base) so the
                  three gradient fills sit edge-to-edge instead of overlapping. */}
              <Area
                type="monotone"
                dataKey="bear"
                stackId="proj"
                stroke="var(--loss)"
                strokeWidth={2}
                fill="url(#fill-bear)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="baseDelta"
                stackId="proj"
                stroke="var(--muted-foreground)"
                strokeWidth={2}
                fill="url(#fill-base)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="bullDelta"
                stackId="proj"
                stroke="var(--gain)"
                strokeWidth={2}
                fill="url(#fill-bull)"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            No data yet — connect an account or add a manual entry.
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-center gap-1">
        {HORIZONS.map((h) => (
          <button
            key={h.key}
            onClick={() => setHorizon(h.key)}
            disabled={!hasData}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
              horizon === h.key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {h.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProjectionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ProjectionPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-muted-foreground">Year {p.year}</div>
      <div className="mt-1 space-y-0.5">
        <div className="text-gain">Bull: {formatCurrency(p.bull)}</div>
        <div className="text-muted-foreground">Base: {formatCurrency(p.base)}</div>
        <div className="text-loss">Bear: {formatCurrency(p.bear)}</div>
      </div>
    </div>
  );
}
