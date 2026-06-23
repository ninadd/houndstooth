"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountRow } from "@/components/dashboard/accounts-table";
import {
  addManualAccount,
  deleteManualAccount,
  updateManualAccount,
} from "@/lib/actions/manual-accounts";

/** A manual account row, plus the holdings (positions) backing an investment
 *  account, needed to prefill the edit dialog. Empty for property/debt rows. */
export type ManualAccountRow = AccountRow & {
  holdings: { ticker: string | null; units: number | null; cost_basis: number | null }[];
};

type Category = "property" | "debt" | "investment";
type TaxTreatment = "taxable" | "tax_advantaged";

const CATEGORY_LABEL: Record<Category, string> = {
  investment: "Investments",
  property: "Property",
  debt: "Debt (mortgage, HELOC, credit card)",
};

/** One holding row in the form. `defaultUnits`/`defaultCostBasis` only matter
 *  on first mount (CurrencyInput is uncontrolled), so they don't need to be
 *  reactive — just carried alongside the row. */
type HoldingRow = {
  id: string;
  ticker: string;
  defaultUnits?: number | null;
  defaultCostBasis?: number | null;
};

function newHoldingRow(): HoldingRow {
  return { id: crypto.randomUUID(), ticker: "" };
}

type TickerSuggestion = { symbol: string; name: string };

/** Debounced ticker search against Yahoo Finance. */
function TickerField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 1) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/securities/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSuggestions(data.results ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const shown = value.trim().length < 1 ? [] : suggestions;

  return (
    <div className="relative">
      <Input
        autoComplete="off"
        placeholder="Ticker, e.g. AAPL"
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
      />
      {open && shown.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover py-1 shadow-md">
          {shown.map((s) => (
            <li key={s.symbol}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange(s.symbol);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{s.symbol}</span>
                <span className="truncate text-xs text-muted-foreground">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ManualAccountFields({
  label,
  setLabel,
  category,
  setCategory,
  taxTreatment,
  setTaxTreatment,
  holdingRows,
  setHoldingRows,
  defaultValue,
}: {
  label: string;
  setLabel: (v: string) => void;
  category: Category;
  setCategory: (v: Category) => void;
  taxTreatment: TaxTreatment;
  setTaxTreatment: (v: TaxTreatment) => void;
  holdingRows: HoldingRow[];
  setHoldingRows: (rows: HoldingRow[]) => void;
  defaultValue?: number | null;
}) {
  const isSingleNoTicker = holdingRows.length === 1 && holdingRows[0].ticker.trim().length === 0;

  function updateTicker(id: string, ticker: string) {
    setHoldingRows(holdingRows.map((r) => (r.id === id ? { ...r, ticker } : r)));
  }

  function addRow() {
    setHoldingRows([...holdingRows, newHoldingRow()]);
  }

  function removeRow(id: string) {
    setHoldingRows(holdingRows.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="label">Label</Label>
        <Input
          id="label"
          name="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Primary home, Family trust"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <input type="hidden" name="category" value={category} />
        <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v: string) => CATEGORY_LABEL[v as Category] ?? v}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="investment">Investments</SelectItem>
            <SelectItem value="property">Property</SelectItem>
            <SelectItem value="debt">Debt (mortgage, HELOC, credit card)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {category === "investment" && (
        <div className="space-y-2">
          <Label>Tax treatment</Label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="tax_treatment"
                value="taxable"
                checked={taxTreatment === "taxable"}
                onChange={() => setTaxTreatment("taxable")}
                className="size-4 accent-[var(--primary)]"
              />
              Taxable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="tax_treatment"
                value="tax_advantaged"
                checked={taxTreatment === "tax_advantaged"}
                onChange={() => setTaxTreatment("tax_advantaged")}
                className="size-4 accent-[var(--primary)]"
              />
              Tax-advantaged
            </label>
          </div>
        </div>
      )}

      {category === "investment" && (
        <div className="space-y-3">
          <Label>Holdings</Label>
          {holdingRows.map((row, i) => {
            const showUnitsAndCostBasis = row.ticker.trim().length > 0 || holdingRows.length > 1;
            return (
              <div key={row.id} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <TickerField value={row.ticker} onChange={(v) => updateTicker(row.id, v)} />
                  </div>
                  {holdingRows.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-loss"
                      aria-label="Remove holding"
                      onClick={() => removeRow(row.id)}
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
                <input type="hidden" name="ticker" value={row.ticker} />

                {showUnitsAndCostBasis && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`units-${row.id}`} className="text-xs">
                        Units
                      </Label>
                      <CurrencyInput
                        key={`${row.id}-units`}
                        id={`units-${row.id}`}
                        name="units"
                        prefix=""
                        maxDecimals={6}
                        placeholder="0"
                        defaultValue={row.defaultUnits}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`cost-${row.id}`} className="text-xs">
                        Cost basis
                      </Label>
                      <CurrencyInput
                        key={`${row.id}-cost`}
                        id={`cost-${row.id}`}
                        name="cost_basis"
                        placeholder="0.00"
                        defaultValue={row.defaultCostBasis}
                      />
                    </div>
                  </div>
                )}
                {!showUnitsAndCostBasis && i === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Leave blank to track a value Yahoo Finance can&apos;t price (e.g. a 529
                    plan).
                  </p>
                )}
              </div>
            );
          })}

          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="size-4" /> Add holding
          </Button>

          {isSingleNoTicker && (
            <div className="space-y-2">
              <Label htmlFor="value">Current value (USD)</Label>
              <CurrencyInput
                id="value"
                name="value"
                placeholder="0.00"
                defaultValue={defaultValue}
                required
              />
            </div>
          )}
        </div>
      )}

      {category !== "investment" && (
        <div className="space-y-2">
          <Label htmlFor="value">{category === "debt" ? "Balance owed (USD)" : "Value (USD)"}</Label>
          <CurrencyInput
            id="value"
            name="value"
            placeholder="0.00"
            defaultValue={defaultValue}
            required
          />
        </div>
      )}
    </div>
  );
}

export function AddManualAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<Category>("investment");
  const [taxTreatment, setTaxTreatment] = useState<TaxTreatment>("taxable");
  const [holdingRows, setHoldingRows] = useState<HoldingRow[]>([newHoldingRow()]);

  function reset() {
    setLabel("");
    setCategory("investment");
    setTaxTreatment("taxable");
    setHoldingRows([newHoldingRow()]);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result = await addManualAccount(formData);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Account added.");
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger render={<Button>Add account</Button>} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add account</DialogTitle>
            <DialogDescription>
              Track an asset, debt, or investment that isn&apos;t connected through SnapTrade.
            </DialogDescription>
          </DialogHeader>

          <ManualAccountFields
            label={label}
            setLabel={setLabel}
            category={category}
            setCategory={setCategory}
            taxTreatment={taxTreatment}
            setTaxTreatment={setTaxTreatment}
            holdingRows={holdingRows}
            setHoldingRows={setHoldingRows}
          />

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ManualAccountEditDialog({ account }: { account: ManualAccountRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [label, setLabel] = useState(account.name);
  const [category, setCategory] = useState<Category>(account.manual_category ?? "investment");
  const [taxTreatment, setTaxTreatment] = useState<TaxTreatment>(account.tax_treatment);
  const [holdingRows, setHoldingRows] = useState<HoldingRow[]>(() =>
    account.holdings.length > 0
      ? account.holdings.map((h) => ({
          id: crypto.randomUUID(),
          ticker: h.ticker ?? "",
          defaultUnits: h.units,
          defaultCostBasis: h.cost_basis,
        }))
      : [newHoldingRow()],
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const formData = new FormData(e.currentTarget);
    formData.set("id", account.id);
    const result = await updateManualAccount(formData);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Account updated.");
    setOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    setPending(true);
    const formData = new FormData();
    formData.set("id", account.id);
    await deleteManualAccount(formData);
    setPending(false);
    setOpen(false);
    toast.success("Account deleted.");
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
            aria-label={`Edit ${account.name}`}
          >
            <Pencil className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit account</DialogTitle>
            <DialogDescription>Update or remove this manually added account.</DialogDescription>
          </DialogHeader>

          <ManualAccountFields
            label={label}
            setLabel={setLabel}
            category={category}
            setCategory={setCategory}
            taxTreatment={taxTreatment}
            setTaxTreatment={setTaxTreatment}
            holdingRows={holdingRows}
            setHoldingRows={setHoldingRows}
            defaultValue={account.current_balance}
          />

          <DialogFooter className="justify-between sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-loss hover:text-loss"
              disabled={pending}
              onClick={handleDelete}
            >
              Delete
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
