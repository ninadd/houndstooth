"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  usePlaidLink,
  type PlaidLinkOnSuccess,
} from "react-plaid-link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LINK_TOKEN_KEY, exchangePublicToken } from "@/lib/plaid-link";

export function AccountActions({ hasAccounts }: { hasAccounts: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const openRequested = useRef(false);
  const [busy, setBusy] = useState(false);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (public_token) => {
      setBusy(true);
      try {
        const data = await exchangePublicToken(public_token);
        toast.success(
          `Linked. Synced ${data.accounts} accounts, ${data.holdings} holdings.`,
        );
        router.refresh();
      } catch {
        toast.error("Failed to link institution.");
      } finally {
        localStorage.removeItem(LINK_TOKEN_KEY);
        setBusy(false);
        setToken(null);
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit: () => setToken(null),
  });

  // Auto-open Link once we have a token and the SDK is ready.
  useEffect(() => {
    if (openRequested.current && token && ready) {
      openRequested.current = false;
      open();
    }
  }, [token, ready, open]);

  async function handleConnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      if (!res.ok) throw new Error("link-token failed");
      const { link_token } = await res.json();
      // Persist so the OAuth redirect page can resume Link with the same token.
      localStorage.setItem(LINK_TOKEN_KEY, link_token);
      openRequested.current = true;
      setToken(link_token);
    } catch {
      toast.error("Couldn't start Plaid Link.");
    } finally {
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
      {hasAccounts && (
        <Button variant="outline" onClick={handleSync} disabled={busy}>
          Sync
        </Button>
      )}
      <Button onClick={handleConnect} disabled={busy}>
        {hasAccounts ? "Add account" : "Connect account"}
      </Button>
    </div>
  );
}
