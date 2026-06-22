"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/format";

export type HeroPoint = {
  /** YYYY-MM-DD (PT) snapshot date. */
  date: string;
  netWorth: number;
  investments: number;
};

type Metric = "netWorth" | "investments";
type RangeKey = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y" | "10Y" | "ALL";

/**
 * `cutoff` returns the earliest YYYY-MM-DD to include, or null for all time.
 * `tail`, when set, instead takes the last N snapshots regardless of date — used
 * by 1D to compare the prior close to the latest close even across weekend gaps.
 */
type RangeDef = {
  key: RangeKey;
  label: string;
  cutoff: (now: Date) => string | null;
  tail?: number;
};

function minusDays(now: Date, days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function minusYears(now: Date, years: number): string {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

const RANGES: RangeDef[] = [
  { key: "1D", label: "since prior close", cutoff: () => null, tail: 2 },
  { key: "1W", label: "past week", cutoff: (n) => minusDays(n, 7) },
  { key: "1M", label: "past month", cutoff: (n) => minusDays(n, 30) },
  { key: "3M", label: "past 3 months", cutoff: (n) => minusDays(n, 90) },
  { key: "YTD", label: "year to date", cutoff: (n) => `${n.getFullYear()}-01-01` },
  { key: "1Y", label: "past year", cutoff: (n) => minusYears(n, 1) },
  { key: "5Y", label: "past 5 years", cutoff: (n) => minusYears(n, 5) },
  { key: "10Y", label: "past 10 years", cutoff: (n) => minusYears(n, 10) },
  { key: "ALL", label: "all time", cutoff: () => null },
];

const METRICS: { key: Metric; title: string }[] = [
  { key: "netWorth", title: "Net Worth" },
  { key: "investments", title: "Investments" },
];

export function HeroCharts({
  series,
  latest,
}: {
  series: HeroPoint[];
  latest: { netWorth: number; investments: number };
}) {
  const [range, setRange] = useState<RangeKey>("1M");
  const [activeMetric, setActiveMetric] = useState<Metric>("netWorth");
  const rangeDef = RANGES.find((r) => r.key === range)!;

  return (
    <section className="w-full space-y-4">
      {/* Mobile: tabbed single chart */}
      <div className="lg:hidden">
        <div className="mb-4 flex gap-1 border-b border-border">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setActiveMetric(m.key)}
              className={cn(
                "relative mr-6 px-1 pb-3 text-sm font-medium transition-colors",
                activeMetric === m.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.title}
              {activeMetric === m.key && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
              )}
            </button>
          ))}
        </div>
        <ChartPanel
          title={METRICS.find((m) => m.key === activeMetric)!.title}
          metric={activeMetric}
          series={series}
          current={latest[activeMetric]}
          rangeDef={rangeDef}
          showTitle={false}
        />
      </div>

      {/* Desktop: both charts side by side */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-2">
        <ChartPanel
          title="Net Worth"
          metric="netWorth"
          series={series}
          current={latest.netWorth}
          rangeDef={rangeDef}
        />
        <ChartPanel
          title="Investments"
          metric="investments"
          series={series}
          current={latest.investments}
          rangeDef={rangeDef}
        />
      </div>

      {/* Shared range control — scrolls horizontally on mobile, wraps off */}
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0 lg:justify-start">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            disabled={series.length === 0}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
              range === r.key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {r.key}
          </button>
        ))}
      </div>
    </section>
  );
}

function ChartPanel({
  title,
  metric,
  series,
  current,
  rangeDef,
  showTitle = true,
}: {
  title: string;
  metric: Metric;
  series: HeroPoint[];
  current: number;
  rangeDef: RangeDef;
  showTitle?: boolean;
}) {
  const data = useMemo(() => {
    if (series.length === 0) return [];
    const cutoff = rangeDef.cutoff(new Date());
    let pts = rangeDef.tail
      ? series.slice(-rangeDef.tail)
      : cutoff === null
        ? series
        : series.filter((p) => p.date >= cutoff);
    // Fall back to the most recent points if the range has too few.
    if (pts.length < 2) pts = series.slice(-2);
    // A single snapshot: duplicate it so a flat line + point is visible.
    if (pts.length === 1) pts = [pts[0], pts[0]];
    return pts.map((p) => ({ ...p, ts: dateToTs(p.date) }));
  }, [series, rangeDef]);

  const hasData = data.length > 0;

  const axis = useMemo(() => {
    if (!hasData) return null;
    const tsValues = data.map((d) => d.ts);
    const minTs = Math.min(...tsValues);
    const maxTs = Math.max(...tsValues);
    return buildTimeAxis(minTs, maxTs);
  }, [data, hasData]);
  const first = hasData ? data[0][metric] : current;
  const change = current - first;
  const pct = first !== 0 ? (change / first) * 100 : 0;
  const positive = change >= 0;
  const lineColor = positive ? "var(--gain)" : "var(--loss)";
  const gradientId = `fill-${metric}`;
  const showDots = data.length <= 31;

  return (
    <div className="rounded-2xl border border-border p-5">
      {showTitle && (
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
      )}
      <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
        {formatCurrency(current, { cents: true })}
      </div>
      <div
        className={cn(
          "mt-1 flex items-center gap-2 text-sm font-medium tabular-nums",
          positive ? "text-gain" : "text-loss",
        )}
      >
        <span>{formatSignedCurrency(change)}</span>
        <span>({formatPercent(pct)})</span>
        <span className="font-normal text-muted-foreground">{rangeDef.label}</span>
      </div>

      <div className="mt-4 h-56 w-full">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={axisDomain(data)}
                ticks={axis?.ticks}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={false}
                tick={<AxisTick formatter={axis?.formatter ?? String} />}
                tickMargin={8}
                minTickGap={20}
                height={24}
                padding={{ left: 12, right: 12 }}
              />
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <ReferenceLine y={first} stroke="var(--border)" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                content={<HeroTooltip metric={metric} />}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke={lineColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                dot={showDots ? { r: 2.5, fill: lineColor, strokeWidth: 0 } : false}
                activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            No data yet — connect an account or add a manual entry.
          </div>
        )}
      </div>
    </div>
  );
}

const DAY_MS = 86_400_000;

function dateToTs(date: string): number {
  return new Date(`${date}T00:00:00`).getTime();
}

function axisDomain(data: { ts: number }[]): [number, number] {
  const ts = data.map((d) => d.ts);
  const min = Math.min(...ts);
  const max = Math.max(...ts);
  // Single distinct date: pad ±12h so the axis/line have room to render.
  return min === max ? [min - DAY_MS / 2, max + DAY_MS / 2] : [min, max];
}

type TimeAxis = { ticks: number[]; formatter: (ts: number) => string };

/**
 * Choose tick granularity + label format from the visible span:
 *   ≤9d daily · ≤45d weekly · ≤120d monthly · ≤400d bi-monthly ·
 *   ≤3y quarterly · ≤6y yearly · else 2-yearly.
 */
function buildTimeAxis(minTs: number, maxTs: number): TimeAxis {
  const spanDays = (maxTs - minTs) / DAY_MS;

  if (spanDays <= 9) return { ticks: dayTicks(minTs, maxTs, 1), formatter: fmtWeekday };
  if (spanDays <= 45) return { ticks: dayTicks(minTs, maxTs, 7), formatter: fmtMonthDay };
  if (spanDays <= 120) return { ticks: monthTicks(minTs, maxTs, 1), formatter: fmtMonth };
  if (spanDays <= 400) return { ticks: monthTicks(minTs, maxTs, 2), formatter: fmtMonth };
  if (spanDays <= 1100) return { ticks: monthTicks(minTs, maxTs, 3), formatter: fmtMonthYear };
  if (spanDays <= 2200) return { ticks: yearTicks(minTs, maxTs, 1), formatter: fmtYear };
  return { ticks: yearTicks(minTs, maxTs, 2), formatter: fmtYear };
}

function dayTicks(minTs: number, maxTs: number, step: number): number[] {
  const ticks: number[] = [];
  const start = new Date(minTs);
  start.setHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= maxTs; t += step * DAY_MS) {
    if (t >= minTs) ticks.push(t);
  }
  return ticks.length ? ticks : [minTs];
}

function monthTicks(minTs: number, maxTs: number, step: number): number[] {
  const ticks: number[] = [];
  const cur = new Date(new Date(minTs).getFullYear(), new Date(minTs).getMonth(), 1);
  while (cur.getTime() <= maxTs) {
    if (cur.getTime() >= minTs && cur.getMonth() % step === 0) {
      ticks.push(cur.getTime());
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  return ticks.length ? ticks : [minTs];
}

function yearTicks(minTs: number, maxTs: number, step: number): number[] {
  const ticks: number[] = [];
  const cur = new Date(new Date(minTs).getFullYear(), 0, 1);
  while (cur.getTime() <= maxTs) {
    if (cur.getTime() >= minTs && (step === 1 || cur.getFullYear() % step === 0)) {
      ticks.push(cur.getTime());
    }
    cur.setFullYear(cur.getFullYear() + 1);
  }
  return ticks.length ? ticks : [minTs];
}

const fmtWeekday = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { weekday: "short" });
const fmtMonthDay = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtMonth = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short" });
const fmtMonthYear = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fmtYear = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { year: "numeric" });

type AxisTickProps = {
  x?: number;
  y?: number;
  index?: number;
  visibleTicksCount?: number;
  payload?: { value: number };
  formatter: (ts: number) => string;
};

/**
 * Custom axis tick: keeps Recharts' default vertical placement but anchors the
 * first label to the chart's left edge and the last to the right edge, so they
 * sit flush instead of being centered (and clipping) at the extremes.
 */
function AxisTick({
  x,
  y,
  index,
  visibleTicksCount,
  payload,
  formatter,
}: AxisTickProps) {
  const isFirst = index === 0;
  const isLast =
    visibleTicksCount !== undefined && index === visibleTicksCount - 1;
  const textAnchor = isFirst ? "start" : isLast ? "end" : "middle";
  return (
    <text
      x={x}
      y={y}
      dy="0.71em"
      textAnchor={textAnchor}
      fontSize={11}
      fill="var(--muted-foreground)"
    >
      {payload ? formatter(payload.value) : ""}
    </text>
  );
}

function HeroTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: { payload: HeroPoint }[];
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-semibold tabular-nums">
        {formatCurrency(point[metric], { cents: true })}
      </div>
      <div className="mt-0.5 text-muted-foreground">
        {new Date(`${point.date}T00:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </div>
    </div>
  );
}
