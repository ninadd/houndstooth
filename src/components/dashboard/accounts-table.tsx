import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";

export type AccountRow = {
  id: string;
  name: string;
  official_name: string | null;
  type: string | null;
  subtype: string | null;
  tax_treatment: "taxable" | "tax_advantaged";
  tax_treatment_override: "taxable" | "tax_advantaged" | null;
  is_debt: boolean;
  current_balance: number | null;
  mask: string | null;
  institution_name: string | null;
};

export function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  return (
    <div className="rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Tax</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => {
            const treatment = a.tax_treatment_override ?? a.tax_treatment;
            const balance = a.current_balance ?? 0;
            return (
              <TableRow key={a.id}>
                <TableCell>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.institution_name ?? "—"}
                    {a.mask ? ` ••${a.mask}` : ""}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground capitalize">
                  {a.subtype ?? a.type ?? "—"}
                </TableCell>
                <TableCell>
                  {a.is_debt ? (
                    <Badge variant="outline" className="text-loss">
                      debt
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className={
                        treatment === "tax_advantaged" ? "text-chart-2" : ""
                      }
                    >
                      {treatment === "tax_advantaged"
                        ? "tax-advantaged"
                        : "taxable"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  <span className={a.is_debt ? "text-loss" : ""}>
                    {a.is_debt ? "−" : ""}
                    {formatCurrency(Math.abs(balance))}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
