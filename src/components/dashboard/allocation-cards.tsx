import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { MOCK_LATEST } from "@/lib/mock-data";

export function AllocationCards() {
  const { taxAdvantaged, taxable, homeValue, netWorth } = MOCK_LATEST;
  const investable = taxAdvantaged + taxable;
  const advPct = Math.round((taxAdvantaged / investable) * 100);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Tax treatment split */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Tax treatment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-chart-2"
              style={{ width: `${advPct}%` }}
            />
            <div className="h-full bg-gain" style={{ width: `${100 - advPct}%` }} />
          </div>
          <div className="flex justify-between text-sm">
            <div>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-chart-2" />
                <span className="text-muted-foreground">Tax-advantaged</span>
              </div>
              <div className="mt-1 font-semibold tabular-nums">
                {formatCurrency(taxAdvantaged)}
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="text-muted-foreground">Taxable</span>
                <span className="size-2 rounded-full bg-gain" />
              </div>
              <div className="mt-1 font-semibold tabular-nums">
                {formatCurrency(taxable)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assets vs home */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Composition
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Investments" value={formatCurrency(investable)} />
          <Row label="Home value" value={formatCurrency(homeValue)} />
          <div className="border-t border-border pt-3">
            <Row label="Net worth" value={formatCurrency(netWorth)} strong />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
