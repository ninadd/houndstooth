"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AddManualAccountDialog } from "@/components/dashboard/manual-account-dialog";
import { refreshManualAccountPrices } from "@/lib/actions/manual-accounts";

/** Sync + Add account for the "Manually linked accounts" section — mirrors
 *  AccountActions' styling. "Sync" here re-prices ticker-backed manual
 *  holdings from Yahoo Finance instead of pulling from a brokerage. */
export function ManualAccountActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSync() {
    setBusy(true);
    try {
      const result = await refreshManualAccountPrices();
      if (result.error) throw new Error(result.error);
      const n = result.refreshed ?? 0;
      toast.success(`Refreshed ${n} price${n === 1 ? "" : "s"}.`);
      router.refresh();
    } catch {
      toast.error("Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={handleSync} disabled={busy}>
        Sync
      </Button>
      <AddManualAccountDialog />
    </div>
  );
}
