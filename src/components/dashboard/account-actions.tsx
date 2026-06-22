"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AccountActions({
  hasAccounts,
  syncOnly = false,
}: {
  hasAccounts: boolean;
  syncOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/snaptrade/connect", { method: "POST" });
      if (!res.ok) throw new Error("connect failed");
      const { redirectURI } = await res.json();
      if (!redirectURI) throw new Error("no redirectURI");
      // Hand off to the SnapTrade Connection Portal (URL expires in ~5 min).
      window.location.href = redirectURI;
      // We navigate away on success, so leave `busy` set.
    } catch {
      toast.error("Couldn't start the connection.");
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) throw new Error("sync failed");
      const data = await res.json();
      toast.success(`Synced ${data.accounts} accounts, ${data.holdings} holdings.`);
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
      {!syncOnly && (
        <Button onClick={handleConnect} disabled={busy}>
          {hasAccounts ? "Add account" : "Connect account"}
        </Button>
      )}
    </div>
  );
}
