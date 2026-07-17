import { formatPercent } from "@/lib/format";
import type { SummaryHolding } from "@/lib/daily-summary";

/**
 * Winners & losers: the day's notable movers (flagged by the holdings report)
 * with the Gemini-provided reason for each move.
 */
export function MoversSection({ holdings }: { holdings: SummaryHolding[] }) {
  const movers = holdings.filter(
    (h) => h.isMover && h.ticker && h.changePct != null,
  );
  const gainers = movers
    .filter((h) => h.direction === "up")
    .sort((a, b) => b.changePct! - a.changePct!);
  const losers = movers
    .filter((h) => h.direction === "down")
    .sort((a, b) => a.changePct! - b.changePct!);

  if (gainers.length === 0 && losers.length === 0) return null;

  return (
    <div className="space-y-3">
      {gainers.length > 0 && (
        <MoversCard title="Top winners" movers={gainers} tone="gain" />
      )}
      {losers.length > 0 && (
        <MoversCard title="Top losers" movers={losers} tone="loss" />
      )}
    </div>
  );
}

function MoversCard({
  title,
  movers,
  tone,
}: {
  title: string;
  movers: SummaryHolding[];
  tone: "gain" | "loss";
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      <ul className="space-y-3">
        {movers.map((m) => (
          <li key={`${m.ticker}-${m.name}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{m.ticker}</span>
              <span
                className={
                  tone === "gain"
                    ? "text-gain text-sm tabular-nums"
                    : "text-loss text-sm tabular-nums"
                }
              >
                {formatPercent(m.changePct!)}
              </span>
            </div>
            {m.reason && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {m.reason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
