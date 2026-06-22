import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { SnapshotFigures } from "@/lib/snapshot";

export function SummaryCards({ figures }: { figures: SnapshotFigures }) {
  const {
    net_worth,
    total_assets,
    total_debts,
    investable_assets,
    home_value,
    taxable_total,
    tax_advantaged_total,
  } = figures;

  const investable = taxable_total + tax_advantaged_total;
  const advPct = investable > 0 ? Math.round((tax_advantaged_total / investable) * 100) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Net worth */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Net worth
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-semibold tabular-nums">
            {formatCurrency(net_worth)}
          </div>
          <div className="space-y-1 text-sm">
            <Row label="Assets" value={formatCurrency(total_assets)} />
            <Row
              label="Debts"
              value={`−${formatCurrency(total_debts)}`}
              valueClass="text-loss"
            />
          </div>
        </CardContent>
      </Card>

      {/* Investable assets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Investable assets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-semibold tabular-nums">
            {formatCurrency(investable_assets)}
          </div>
          <div className="space-y-1 text-sm">
            <Row label="Investments" value={formatCurrency(investable_assets)} />
            <Row label="Home value" value={formatCurrency(home_value)} />
          </div>
        </CardContent>
      </Card>

      {/* Tax treatment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Tax treatment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-gain" style={{ width: `${advPct}%` }} />
            <div className="h-full bg-chart-2" style={{ width: `${100 - advPct}%` }} />
          </div>
          <div className="space-y-1 text-sm">
            <Row
              label="Tax-advantaged"
              value={formatCurrency(tax_advantaged_total)}
              dot="bg-gain"
            />
            <Row
              label="Taxable"
              value={formatCurrency(taxable_total)}
              dot="bg-chart-2"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
  dot,
}: {
  label: string;
  value: string;
  valueClass?: string;
  dot?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">
        {dot && <span className={`size-2 rounded-full ${dot}`} />}
        {label}
      </span>
      <span className={`font-medium tabular-nums ${valueClass ?? ""}`}>
        {value}
      </span>
    </div>
  );
}
