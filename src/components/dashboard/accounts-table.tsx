"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Pencil,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { formatAccountType } from "@/lib/account-type";
import { isCashType } from "@/lib/tax-classification";
import { renameAccount } from "@/lib/actions/accounts";

export type AccountRow = {
  id: string;
  name: string;
  custom_name: string | null;
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

type SortColumn = "account" | "type" | "tax" | "balance";
type SortDir = "asc" | "desc";

/** Display name, preferring the user's custom override over the broker name. */
function displayName(a: AccountRow): string {
  return a.custom_name ?? a.name;
}

type TaxInfo = { label: string; className: string; rank: number };

/** Resolve the Tax badge: Debt for liabilities, N/A for cash, else the split. */
function taxInfo(a: AccountRow): TaxInfo {
  if (a.is_debt) return { label: "Debt", className: "text-loss", rank: 0 };
  if (isCashType(a.type, a.subtype)) {
    return { label: "N/A", className: "text-muted-foreground", rank: 1 };
  }
  const treatment = a.tax_treatment_override ?? a.tax_treatment;
  if (treatment === "tax_advantaged") {
    return { label: "Tax-advantaged", className: "text-chart-2", rank: 3 };
  }
  return { label: "Taxable", className: "", rank: 2 };
}

export function AccountsTable({
  accounts,
  showBalance = true,
  editable = false,
}: {
  accounts: AccountRow[];
  showBalance?: boolean;
  editable?: boolean;
}) {
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir }>(() => ({
    column: showBalance ? "balance" : "account",
    dir: showBalance ? "desc" : "asc",
  }));

  function toggleSort(column: SortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column, dir: column === "balance" ? "desc" : "asc" },
    );
  }

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const rows = [...accounts];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sort.column) {
        case "account":
          cmp = displayName(a).localeCompare(displayName(b));
          break;
        case "type":
          cmp = formatAccountType(a.type, a.subtype, a.name).localeCompare(
            formatAccountType(b.type, b.subtype, b.name),
          );
          break;
        case "tax":
          cmp = taxInfo(a).rank - taxInfo(b).rank;
          break;
        case "balance":
          cmp = (a.current_balance ?? 0) - (b.current_balance ?? 0);
          break;
      }
      // Stable tiebreak so equal keys keep a deterministic order.
      if (cmp === 0) cmp = displayName(a).localeCompare(displayName(b));
      return cmp * dir;
    });
    return rows;
  }, [accounts, sort]);

  return (
    <div className="rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader
              column="account"
              label="Account"
              sort={sort}
              onSort={toggleSort}
            />
            <SortHeader
              column="type"
              label="Type"
              sort={sort}
              onSort={toggleSort}
              className="hidden sm:table-cell"
            />
            <SortHeader
              column="tax"
              label="Tax"
              sort={sort}
              onSort={toggleSort}
              className="hidden sm:table-cell"
            />
            {showBalance && (
              <SortHeader
                column="balance"
                label="Balance"
                sort={sort}
                onSort={toggleSort}
                align="right"
              />
            )}
            {editable && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((a) => {
            const tax = taxInfo(a);
            const balance = a.current_balance ?? 0;
            return (
              <TableRow key={a.id}>
                <TableCell className="w-full max-w-0">
                  <div className="truncate font-medium">{displayName(a)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {a.institution_name ?? "—"}
                    {a.mask ? ` ••${a.mask}` : ""}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {formatAccountType(a.type, a.subtype, a.name)}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="outline" className={tax.className}>
                    {tax.label}
                  </Badge>
                </TableCell>
                {showBalance && (
                  <TableCell className="text-right font-medium tabular-nums">
                    <span className={a.is_debt ? "text-loss" : ""}>
                      {a.is_debt ? "−" : ""}
                      {formatCurrency(Math.abs(balance))}
                    </span>
                  </TableCell>
                )}
                {editable && (
                  <TableCell className="text-right">
                    <RenameDialog account={a} />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SortHeader({
  column,
  label,
  sort,
  onSort,
  align = "left",
  className,
}: {
  column: SortColumn;
  label: string;
  sort: { column: SortColumn; dir: SortDir };
  onSort: (c: SortColumn) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.column === column;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 font-medium outline-none hover:text-foreground focus-visible:underline",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5 shrink-0" />
      </button>
    </TableHead>
  );
}

function RenameDialog({ account }: { account: AccountRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const formData = new FormData(e.currentTarget);
    formData.set("id", account.id);
    const result = await renameAccount(formData);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Account name updated.");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label={`Rename ${displayName(account)}`}
          >
            <Pencil className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename account</DialogTitle>
            <DialogDescription>
              Set a custom name for this account. Leave blank to use the name from{" "}
              {account.institution_name ?? "your broker"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="custom_name">Display name</Label>
            <Input
              id="custom_name"
              name="custom_name"
              defaultValue={account.custom_name ?? ""}
              placeholder={account.name}
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
