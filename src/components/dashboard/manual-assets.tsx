"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { formatCurrency } from "@/lib/format";
import {
  addManualAsset,
  deleteManualAsset,
} from "@/lib/actions/manual-assets";

export type ManualAsset = {
  id: string;
  label: string;
  asset_class: "real_estate" | "equity_comp" | "529" | "other";
  value: number;
  is_debt: boolean;
  tax_treatment: "taxable" | "tax_advantaged";
};

const CLASS_LABEL: Record<ManualAsset["asset_class"], string> = {
  real_estate: "Real estate",
  equity_comp: "Equity comp",
  "529": "529",
  other: "Other",
};

const CLASS_OPTION_LABEL: Record<ManualAsset["asset_class"], string> = {
  real_estate: "Real estate (home)",
  equity_comp: "Equity comp (e.g. Solium)",
  "529": "529 plan",
  other: "Other",
};

export function ManualAssetsCard({ assets }: { assets: ManualAsset[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Manual entries</CardTitle>
          <CardDescription>
            Home value, equity comp, 529, and anything Plaid can&apos;t reach.
          </CardDescription>
        </div>
        <AddAssetDialog />
      </CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No manual entries yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {assets.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium">{a.label}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {CLASS_LABEL[a.asset_class]}
                    </Badge>
                    {a.is_debt && (
                      <Badge variant="outline" className="text-xs text-loss">
                        debt
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-medium tabular-nums ${a.is_debt ? "text-loss" : ""}`}
                  >
                    {a.is_debt ? "−" : ""}
                    {formatCurrency(a.value)}
                  </span>
                  <form action={deleteManualAsset}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button
                      type="submit"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-loss"
                      aria-label={`Delete ${a.label}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AddAssetDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assetClass, setAssetClass] =
    useState<ManualAsset["asset_class"]>("real_estate");
  const [pending, setPending] = useState(false);

  // 529 = always tax-advantaged; real estate = excluded from tax split.
  const showTaxTreatment = assetClass === "equity_comp" || assetClass === "other";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const formData = new FormData(e.currentTarget);
    formData.set("asset_class", assetClass);
    const result = await addManualAsset(formData);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Entry added.");
    setOpen(false);
    setAssetClass("real_estate");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus className="size-4" /> Add
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add manual entry</DialogTitle>
            <DialogDescription>
              Track an asset or debt that isn&apos;t connected through Plaid.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                name="label"
                placeholder="e.g. Primary home, Solium RSUs"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={assetClass}
                onValueChange={(v) =>
                  setAssetClass(v as ManualAsset["asset_class"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) =>
                      CLASS_OPTION_LABEL[v as ManualAsset["asset_class"]] ?? v
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="real_estate">Real estate (home)</SelectItem>
                  <SelectItem value="equity_comp">
                    Equity comp (e.g. Solium)
                  </SelectItem>
                  <SelectItem value="529">529 plan</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="value">Amount (USD)</Label>
              <Input
                id="value"
                name="value"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                required
              />
            </div>

            {showTaxTreatment && (
              <div className="space-y-2">
                <Label htmlFor="tax_treatment">Tax treatment</Label>
                <Select name="tax_treatment" defaultValue="taxable">
                  <SelectTrigger id="tax_treatment" className="w-full">
                    <SelectValue>
                      {(v: string) =>
                        v === "tax_advantaged" ? "Tax-advantaged" : "Taxable"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="taxable">Taxable</SelectItem>
                    <SelectItem value="tax_advantaged">Tax-advantaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_debt"
                className="size-4 rounded border-border accent-[var(--primary)]"
              />
              This is a debt (e.g. mortgage)
            </label>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
