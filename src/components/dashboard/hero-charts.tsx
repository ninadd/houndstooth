"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/format";
import {
  getSeries,
  RANGE_KEYS,
  type RangeKey,
  type SeriesPoint,
} from "@/lib/mock-data";

type Metric = "netWorth" | "investments";

const METRICS: { key: Metric; label: string }[] = [
  { key: "netWorth", label: "Net Worth" },
  { key: "investments", label: "Investments" },
];

const RANGE_LABEL: Record<RangeKey, string> = {
  "1D": "today",
  "1W": "past week",
  "1M": "past month",
  "3M": "past 3 months",
  "1Y": "past year",
  ALL: "all time",
};

export function HeroCharts() {
  const [metric, setMetric] = useState<Metric>("netWorth");
  const [range, setRange] = useState<RangeKey>("1M");

  const data = useMemo(() => getSeries(range), [range]);

  const first = data[0][metric];
  const last = data[data.length - 1][metric];
  const change = last - first;
  const pct = first !== 0 ? (change / first) * 100 : 0;
  const positive = change >= 0;
  const lineColor = positive ? "var(--gain)" : "var(--loss)";

  return (
    <section className="w-full">
      {/* Metric switcher (Robinhood-style segmented tabs) */}
      <div className="flex gap-1 border-b border-border">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={cn(
              "relative px-1 pb-3 text-sm font-medium transition-colors",
              "mr-6",
              metric === m.key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
            {metric === m.key && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
            )}
          </button>
        ))}
      </div>

      {/* Hero number + change */}
      <div className="pt-6">
        <div className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
          {formatCurrency(last, { cents: true })}
        </div>
        <div
          className={cn(
            "mt-2 flex items-center gap-2 text-sm font-medium tabular-nums",
            positive ? "text-gain" : "text-loss",
          )}
        >
          <span>{formatSignedCurrency(change)}</span>
          <span>({formatPercent(pct)})</span>
          <span className="text-muted-foreground font-normal">
            {RANGE_LABEL[range]}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-4 h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <ReferenceLine
              y={first}
              stroke="var(--border)"
              strokeDasharray="4 4"
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={<HeroTooltip metric={metric} />}
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={lineColor}
              strokeWidth={2}
              fill="url(#heroFill)"
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Range pills */}
      <div className="mt-4 flex gap-1">
        {RANGE_KEYS.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              range === r
                ? positive
                  ? "bg-gain/15 text-gain"
                  : "bg-loss/15 text-loss"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </section>
  );
}

function HeroTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: { payload: SeriesPoint }[];
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const date = new Date(point.t);
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-semibold tabular-nums">
        {formatCurrency(point[metric], { cents: true })}
      </div>
      <div className="mt-0.5 text-muted-foreground">
        {date.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}
